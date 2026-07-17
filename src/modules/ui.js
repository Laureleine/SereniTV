import {
    filterSeries,
    fetchSeries,
    getSaisonsAvecStatut,
    aDejaUnSuiviSaisons,
    abandonnerSerie,
    demarrerSerie,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    updateStatutUneSaison,
    setPlatformFilter,
    initRealtimeZapping,
    MOCK_USER_ID,
} from './series.js';

// ─────────────────────────────────────────────
// INITIALISATION
// ─────────────────────────────────────────────

export let currentMode = 'pc';

export function initUI() {
    const overlay = document.getElementById('mode-selection-overlay');
    const btnTv = document.getElementById('btn-select-tv');
    const btnRemote = document.getElementById('btn-select-remote');
    const btnPc = document.getElementById('btn-select-pc');

    if (overlay && btnTv && btnRemote && btnPc) {
        btnTv.addEventListener('click', () => {
            currentMode = 'tv';
            document.body.classList.add('is-tv-mode');
            overlay.classList.add('hidden');
            initRealtimeZapping((payload) => {
                console.log('[REALTIME TV] Événement reçu, mise à jour du catalogue en cours.');
            });
            fetchSeries();
        });

        btnRemote.addEventListener('click', () => {
            currentMode = 'remote';
            document.body.classList.add('is-remote-mode');
            overlay.classList.add('hidden');
            fetchSeries();
        });

        btnPc.addEventListener('click', () => {
            currentMode = 'pc';
            overlay.classList.add('hidden');
            fetchSeries();
        });
    }

    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            navButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            filterSeries(e.target.dataset.filter);
        });
    });

    // Filtres Plateforme
    const platformButtons = document.querySelectorAll('.platform-btn');
    platformButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.target.closest('.platform-btn');
            platformButtons.forEach(b => b.classList.remove('active'));
            targetBtn.classList.add('active');
            const platform = targetBtn.dataset.platform;
            setPlatformFilter(platform === 'all' ? null : platform);
        });
    });

    const container = document.getElementById('series-container');
    // Délégation d'événement unique sur le container des séries
    container.addEventListener('change', (e) => {
        if (e.target.classList.contains('statut-select')) {
            onStatutChange(e);
        } else if (e.target.classList.contains('saison-statut-select')) {
            onSaisonStatutChange(e);
        }
    });

    // Clic sur une carte pour ouvrir l'accordéon des saisons (uniquement si pas en mode TV ni télécommande)
    container.addEventListener('click', (e) => {
        if (currentMode === 'tv' || currentMode === 'remote') return;
        
        // Ignorer si on clique sur un select, un bouton ou le panneau de saisons déjà ouvert
        if (e.target.closest('select') || e.target.closest('button') || e.target.closest('.saisons-panel')) {
            return;
        }

        const card = e.target.closest('.serie-card');
        if (card) {
            toggleSaisonsPanel(card.dataset.serieId, card);
        }
    });

    // Boutons de la télécommande / Zapping mobile
    const btnNo = document.getElementById('remote-no');
    const btnMaybe = document.getElementById('remote-maybe');
    const btnYes = document.getElementById('remote-yes');

    if (btnNo && btnMaybe && btnYes) {
        btnNo.addEventListener('click', async () => {
            const firstCard = document.querySelector('.serie-card');
            if (!firstCard) return;
            const id = parseInt(firstCard.dataset.serieId);
            const title = firstCard.querySelector('.serie-title').textContent;
            await handleAbandonnee(id, title, null);
        });

        btnMaybe.addEventListener('click', async () => {
            const firstCard = document.querySelector('.serie-card');
            if (!firstCard) return;
            const id = parseInt(firstCard.dataset.serieId);
            await handleStatutSimple(id, 'Peut-être', null);
        });

        btnYes.addEventListener('click', async () => {
            const firstCard = document.querySelector('.serie-card');
            if (!firstCard) return;
            const id = parseInt(firstCard.dataset.serieId);
            const title = firstCard.querySelector('.serie-title').textContent;
            await handleEnCours(id, title, null);
        });
    }

    // Écoute fermeture du modal
    document.getElementById('modal-overlay').addEventListener('click', fermerModal);
    document.getElementById('modal-annuler').addEventListener('click', fermerModal);
    document.getElementById('modal-confirmer').addEventListener('click', onConfirmerModal);

    // Barre de recherche TMDB
    initSearchBar();
}

// ─────────────────────────────────────────────
// BARRE DE RECHERCHE TMDB
// ─────────────────────────────────────────────

const TMDB_POSTER_THUMB = 'https://image.tmdb.org/t/p/w92';

/** Délai debounce avant l'appel TMDB (ms) */
const SEARCH_DEBOUNCE_MS = 350;

/** Index du élément actuellement focusé dans la liste de suggestions (-1 = aucun) */
let _activeIndex = -1;

/** Timer debounce */
let _debounceTimer = null;

/**
 * Initialise la barre de recherche et toute son interactivité.
 */
function initSearchBar() {
    const input       = document.getElementById('serie-search');
    const clearBtn    = document.getElementById('search-clear');
    const statusEl    = document.getElementById('search-status');
    const suggestions = document.getElementById('search-suggestions');

    if (!input) return;

    // ── Saisie : déclenche la recherche debounce ée ────────────────
    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearBtn.hidden = q.length === 0;
        clearDebounce();

        if (q.length < 2) {
            fermerSuggestions(suggestions, input, statusEl);
            return;
        }

        setSearchStatus(statusEl, 'loading', '');
        _debounceTimer = setTimeout(() => lancerRecherche(q, input, suggestions, statusEl), SEARCH_DEBOUNCE_MS);
    });

    // ── Clavier : navigation flèches + Escape ───────────────────
    input.addEventListener('keydown', (e) => {
        const items = suggestions.querySelectorAll('.suggestion-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _activeIndex = Math.min(_activeIndex + 1, items.length - 1);
            updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _activeIndex = Math.max(_activeIndex - 1, 0);
            updateActiveItem(items);
        } else if (e.key === 'Enter' && _activeIndex >= 0) {
            e.preventDefault();
            items[_activeIndex].click();
        } else if (e.key === 'Escape') {
            fermerSuggestions(suggestions, input, statusEl);
        }
    });

    // ── Bouton effacer ──────────────────────────────────
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.hidden = true;
        fermerSuggestions(suggestions, input, statusEl);
        input.focus();
    });

    // ── Clic en dehors : ferme les suggestions ────────────────
    document.addEventListener('click', (e) => {
        if (!document.getElementById('search-bar').contains(e.target)) {
            fermerSuggestions(suggestions, input, statusEl);
        }
    });
}

/**
 * Exécute la recherche TMDB et affiche les suggestions.
 */
async function lancerRecherche(query, input, suggestions, statusEl) {
    try {
        const resultats = await rechercherSeriesTMDB(query);

        if (input.value.trim() !== query) return; // Saisie changée entre temps

        if (resultats.length === 0) {
            setSearchStatus(statusEl, 'empty', 'Aucune série trouvée.');
            fermerSuggestions(suggestions, input);
            return;
        }

        setSearchStatus(statusEl, '', '');
        afficherSuggestions(resultats, suggestions, input, statusEl);

    } catch (err) {
        console.error('[SEARCH]', err);
        setSearchStatus(statusEl, 'error', 'Erreur de recherche.');
    }
}

/**
 * Construit et affiche le dropdown de suggestions.
 */
function afficherSuggestions(resultats, suggestions, input, statusEl) {
    _activeIndex = -1;
    suggestions.innerHTML = '';

    resultats.forEach((r, i) => {
        const li = document.createElement('li');
        li.className  = 'suggestion-item';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.dataset.index = i;

        const posterSrc = r.affiche_path
            ? `${TMDB_POSTER_THUMB}${r.affiche_path}`
            : null;

        li.innerHTML = `
            <div class="suggestion-poster">
                ${posterSrc
                    ? `<img src="${posterSrc}" alt="" loading="lazy">`
                    : `<div class="suggestion-poster--empty">🎬</div>`
                }
            </div>
            <div class="suggestion-info">
                <span class="suggestion-titre">${r.titre}</span>
                ${r.titre_orig ? `<span class="suggestion-titre-orig">${r.titre_orig}</span>` : ''}
                <span class="suggestion-annee">${r.annee}</span>
            </div>
            <div class="suggestion-add" aria-hidden="true">+</div>
        `;

        // Hover souris
        li.addEventListener('mouseenter', () => {
            _activeIndex = i;
            updateActiveItem(suggestions.querySelectorAll('.suggestion-item'));
        });

        // Clic : import + fermeture
        li.addEventListener('click', () => importerSuggestion(r, input, suggestions, statusEl));

        suggestions.appendChild(li);
    });

    suggestions.hidden = false;
    input.setAttribute('aria-expanded', 'true');
}

/**
 * Met à jour la classe "active" sur l'élément sélectionné au clavier.
 */
function updateActiveItem(items) {
    items.forEach((item, idx) => {
        const active = idx === _activeIndex;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
        if (active) item.scrollIntoView({ block: 'nearest' });
    });
}

/**
 * Importe la série sélectionnée, puis rafraîchit le catalogue.
 */
async function importerSuggestion(suggestion, input, suggestions, statusEl) {
    fermerSuggestions(suggestions, input);
    input.value = '';
    document.getElementById('search-clear').hidden = true;

    setSearchStatus(statusEl, 'loading', `⏳ Synchronisation de « ${suggestion.titre} »…`);

    try {
        await synchroniserSerieAvecTMDB(suggestion.tmdbId);
        setSearchStatus(statusEl, 'success', `✅ « ${suggestion.titre} » ajoutée !`);
        await fetchSeries();
        // Efface le message de succès après 3s
        setTimeout(() => setSearchStatus(statusEl, '', ''), 3000);
    } catch (err) {
        console.error('[IMPORT]', err);
        setSearchStatus(statusEl, 'error', `❌ ${err.message || 'Erreur d’importation.'}`);
    }
}

/**
 * Ferme le panneau de suggestions et réinitialise l'index actif.
 */
function fermerSuggestions(suggestions, input, statusEl) {
    suggestions.hidden = true;
    suggestions.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    _activeIndex = -1;
    if (statusEl) setSearchStatus(statusEl, '', '');
    clearDebounce();
}

function clearDebounce() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = null;
}

/**
 * Met à jour l'élément de statut (spinner, succès, erreur, vide).
 */
function setSearchStatus(el, type, message) {
    if (!el) return;
    el.textContent = message;
    el.className   = type ? `search-bar__status search-bar__status--${type}` : 'search-bar__status';
}

// ─────────────────────────────────────────────
// RENDU DU CATALOGUE
// ─────────────────────────────────────────────

const STATUTS_VISIONNAGE = ['A voir', 'En cours', 'Terminée', 'Abandonnée', 'Sans intérêt', 'Peut-être'];

export function renderSeries(seriesList) {
    const container = document.getElementById('series-container');
    container.innerHTML = '';

    const isTvMode = currentMode === 'tv';
    const isRemoteMode = currentMode === 'remote';

    if (isTvMode || isRemoteMode) {
        const activeSerie = seriesList[0];
        if (!activeSerie) {
            container.innerHTML = isTvMode ? `
                <div class="tv-empty-state">
                    <div class="tv-empty-icon">📺</div>
                    <h2 class="tv-empty-title">Inbox Trié !</h2>
                    <p class="tv-empty-subtitle">SéréniTV est prêt. Ajoutez ou classez des séries depuis votre mobile.</p>
                </div>
            ` : `
                <div class="empty-state">
                    Tous les titres de l'Inbox ont été classés ! 🎉
                </div>
            `;
            updateRemoteDeckVisibility(0);
            return;
        }

        const card = document.createElement('div');
        card.className = isTvMode ? 'serie-card tv-card' : 'serie-card remote-active-card';
        card.dataset.serieId = activeSerie.id;

        const badge = activeSerie.statut_production === 'Terminée'
            ? '<span class="badge badge--terminee">Terminée</span>'
            : '<span class="badge badge--en-cours">En cours</span>';

        const posterUrl = activeSerie.affiche_path
            ? `https://image.tmdb.org/t/p/w500${activeSerie.affiche_path}`
            : null;

        card.innerHTML = `
            <div class="card-poster">
                ${posterUrl 
                    ? `<img src="${posterUrl}" alt="Affiche de ${activeSerie.titre}" loading="eager">` 
                    : `<div class="poster-placeholder"><span>🎬</span></div>`
                }
            </div>
            <div class="card-content">
                <div class="card-header">
                    <h2 class="serie-title">${activeSerie.titre}</h2>
                    ${badge}
                </div>
                ${activeSerie.plateforme ? `<div class="serie-platform-badge">${activeSerie.plateforme}</div>` : ''}
                <p class="serie-synopsis">${activeSerie.synopsis || 'Aucun résumé disponible.'}</p>
                ${activeSerie.watch_url ? `
                    <a href="${activeSerie.watch_url}" target="_blank" rel="noopener noreferrer" class="btn-netflix-launch">
                        🍿 Lancer sur Netflix
                    </a>
                ` : ''}
            </div>
        `;

        container.appendChild(card);
        updateRemoteDeckVisibility(1);
        return;
    }

    if (!seriesList || seriesList.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucune série trouvée.</div>';
        updateRemoteDeckVisibility(0);
        return;
    }

    seriesList.forEach(serie => {
        const card = document.createElement('div');
        card.className = 'serie-card';
        card.dataset.serieId = serie.id;

        const badge = serie.statut_production === 'Terminée'
            ? '<span class="badge badge--terminee">Terminée</span>'
            : '<span class="badge badge--en-cours">En cours</span>';

        const posterUrl = serie.affiche_path
            ? `https://image.tmdb.org/t/p/w500${serie.affiche_path}`
            : null;

        card.innerHTML = `
            <div class="card-poster">
                ${posterUrl 
                    ? `<img src="${posterUrl}" alt="Affiche de ${serie.titre}" loading="lazy">` 
                    : `<div class="poster-placeholder"><span>🎬</span></div>`
                }
            </div>
            <div class="card-content">
                <div class="card-header">
                    <h2 class="serie-title">${serie.titre}</h2>
                    ${badge}
                </div>
                ${serie.plateforme ? `<div class="serie-platform-badge">${serie.plateforme}</div>` : ''}
                <p class="serie-synopsis">${serie.synopsis || 'Aucun résumé disponible.'}</p>
                <div class="card-footer">
                    <select
                        class="statut-select"
                        id="statut-${serie.id}"
                        data-serie-id="${serie.id}"
                        data-serie-titre="${serie.titre}"
                        aria-label="Statut de visionnage de ${serie.titre}"
                    >
                        <option value="" disabled ${!serie.statut_visionnage ? 'selected' : ''}>Classer cette série…</option>
                        ${STATUTS_VISIONNAGE.map(s =>
                            `<option value="${s}" ${serie.statut_visionnage === s ? 'selected' : ''}>${s}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <!-- Panneau des saisons (caché par défaut) -->
            <div class="saisons-panel" id="saisons-panel-${serie.id}" hidden>
                <div class="saisons-panel-inner" id="saisons-content-${serie.id}">
                    <div class="saisons-loading">Chargement des saisons...</div>
                </div>
            </div>
        `;

        container.appendChild(card);
    });

    updateRemoteDeckVisibility(seriesList.length);
}

/**
 * Met à jour la visibilité de la télécommande sur mobile.
 */
function updateRemoteDeckVisibility(seriesCount) {
    const isTvMode = currentMode === 'tv';
    const remoteDeck = document.getElementById('remote-deck');
    if (!remoteDeck) return;

    const activeNavBtn = document.querySelector('.nav-btn.active');
    const isInboxTab = activeNavBtn && activeNavBtn.dataset.filter === 'all';
    
    // Si on est en mode télécommande OU (mode PC et onglet Inbox avec des séries)
    if (currentMode === 'remote' || (currentMode === 'pc' && isInboxTab && seriesCount > 0)) {
        remoteDeck.hidden = false;
    } else {
        remoteDeck.hidden = true;
    }
}

// ─────────────────────────────────────────────
// GESTION DU CHANGEMENT DE STATUT
// ─────────────────────────────────────────────

/**
 * Gère le changement de statut d'une saison spécifique dans l'accordéon.
 */
async function onSaisonStatutChange(event) {
    const select = event.target;
    const saisonId = parseInt(select.dataset.saisonId);
    const statut = select.value;

    select.disabled = true;
    try {
        const result = await updateStatutUneSaison(saisonId, statut, MOCK_USER_ID);
        if (!result.success) {
            alert("Erreur lors de la mise à jour de la saison.");
        }
    } finally {
        select.disabled = false;
    }
}

/**
 * Dispatcher central des changements de statut.
 * Chaque statut a sa propre branche logique.
 */
async function onStatutChange(event) {
    const select = event.target;

    const serieId    = parseInt(select.dataset.serieId);
    const serieTitre = select.dataset.serieTitre;
    const statut     = select.value;

    select.disabled = true;

    try {
        switch (statut) {

            case 'Abandonnée':
                await handleAbandonnee(serieId, serieTitre, select);
                break;

            case 'En cours':
                await handleEnCours(serieId, serieTitre, select);
                break;

            default:
                await handleStatutSimple(serieId, statut, select);
                break;
        }
    } finally {
        select.disabled = false;
    }
}

// ─────────────────────────────────────────────
// HANDLERS MÉTIER
// ─────────────────────────────────────────────

async function handleStatutSimple(serieId, statut, selectElement) {
    const result = await updateStatutGlobal(serieId, statut, MOCK_USER_ID);
    if (result.success) {
        await fetchSeries();
    } else {
        alert("Une erreur est survenue lors de l'enregistrement. Voir la console pour les détails.");
        selectElement.value = '';
    }
}

async function handleAbandonnee(serieId, serieTitre, selectElement) {
    await ouvrirModal({
        serieId,
        serieTitre,
        selectElement,
        mode: 'abandon',
        titre:       'Abandonner une série',
        description: `À quelle saison vous êtes-vous arrêté pour`,
        labelBtn:    "Confirmer l'abandon",
        finalStatut: 'Abandonnée',
    });
}

async function handleEnCours(serieId, serieTitre, selectElement) {
    const dejaUnSuivi = await aDejaUnSuiviSaisons(serieId, MOCK_USER_ID);

    if (dejaUnSuivi) {
        console.log(`[UI] Reprise de la série ${serieId} — statuts de saisons préservés.`);
        const result = await updateStatutGlobal(serieId, 'En cours', MOCK_USER_ID);
        if (result.success) {
            await fetchSeries();
        } else {
            alert("Une erreur est survenue lors de l'enregistrement.");
            if (selectElement) selectElement.value = '';
        }
    } else {
        await ouvrirModal({
            serieId,
            serieTitre,
            selectElement,
            mode: 'demarrage',
            titre:       'Commencer une série',
            description: `À quelle saison commencez-vous`,
            labelBtn:    'Commencer',
            finalStatut: 'En cours',
        });
    }
}

// ─────────────────────────────────────────────
// MODAL GÉNÉRIQUE (Abandon / Démarrage)
// ─────────────────────────────────────────────

let _modalContext = null;

async function ouvrirModal(config) {
    const { serieId, serieTitre, selectElement, mode, titre, description, labelBtn, finalStatut } = config;

    try {
        const saisons = await getSaisonsAvecStatut(serieId, MOCK_USER_ID);

        if (!saisons || saisons.length === 0) {
            alert("Cette série n'a aucune saison enregistrée.");
            selectElement.value = '';
            return;
        }

        _modalContext = { serieId, serieTitre, selectElement, mode, finalStatut, labelBtn };

        document.getElementById('modal-titre').textContent      = titre;
        document.getElementById('modal-serie-titre').textContent = serieTitre;
        document.getElementById('modal-description-label').textContent = description;
        document.getElementById('modal-confirmer').textContent  = labelBtn;

        const btnConfirmer = document.getElementById('modal-confirmer');
        btnConfirmer.className = mode === 'abandon'
            ? 'btn btn--danger'
            : 'btn btn--primary';

        const saisonSelect = document.getElementById('modal-saison-select');
        saisonSelect.innerHTML = saisons.map(s =>
            `<option value="${s.id}" data-numero="${s.numero_saison}">
                Saison ${s.numero_saison} (${s.nombre_episodes} épisodes)
            </option>`
        ).join('');

        document.getElementById('modal-overlay').classList.add('is-visible');
        document.getElementById('modal-abandon').classList.add('is-visible');

    } catch (err) {
        console.error("[MODAL] Erreur chargement saisons:", err);
        alert("Impossible de charger les saisons. Veuillez réessayer.");
        if (selectElement) selectElement.value = '';
    }
}

function fermerModal(annule = true) {
    document.getElementById('modal-overlay').classList.remove('is-visible');
    document.getElementById('modal-abandon').classList.remove('is-visible');

    if (annule && _modalContext?.selectElement) {
        _modalContext.selectElement.value = '';
    }
    _modalContext = null;
}

async function onConfirmerModal() {
    if (!_modalContext) return;

    const { serieId, mode, finalStatut, selectElement, labelBtn } = _modalContext;
    const saisonSelect   = document.getElementById('modal-saison-select');
    const selectedOption = saisonSelect.options[saisonSelect.selectedIndex];
    const numeroSaison   = parseInt(selectedOption.dataset.numero);

    const btnConfirmer = document.getElementById('modal-confirmer');
    btnConfirmer.disabled = true;
    btnConfirmer.textContent = 'Enregistrement…';

    let result;
    if (mode === 'abandon') {
        result = await abandonnerSerie(serieId, numeroSaison, MOCK_USER_ID);
    } else {
        result = await demarrerSerie(serieId, numeroSaison, MOCK_USER_ID);
    }

    btnConfirmer.disabled = false;
    btnConfirmer.textContent = labelBtn;

    if (result.success) {
        if (selectElement) selectElement.value = finalStatut;
        fermerModal(false);
        await fetchSeries();
    } else {
        alert("Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    }
}

// ─────────────────────────────────────────────
// ACCORDÉON SAISONS
// ─────────────────────────────────────────────

async function toggleSaisonsPanel(serieId, card) {
    const panel = document.getElementById(`saisons-panel-${serieId}`);
    const contentDiv = document.getElementById(`saisons-content-${serieId}`);
    
    if (!panel) return;

    const isOpen = !panel.hidden;

    if (isOpen) {
        panel.hidden = true;
        card.classList.remove('is-expanded');
    } else {
        panel.hidden = false;
        card.classList.add('is-expanded');
        
        if (contentDiv.querySelector('.saisons-loading')) {
            try {
                const saisons = await getSaisonsAvecStatut(serieId, MOCK_USER_ID);
                renderSaisonsList(contentDiv, saisons);
            } catch (err) {
                console.error("Erreur chargement saisons:", err);
                contentDiv.innerHTML = '<div class="saisons-error">Erreur lors du chargement des saisons.</div>';
            }
        }
    }
}

function renderSaisonsList(container, saisons) {
    if (!saisons || saisons.length === 0) {
        container.innerHTML = '<div class="saisons-empty">Aucune saison disponible.</div>';
        return;
    }

    const statuts = ['Pas commencée', 'En cours', 'Terminée'];

    const html = saisons.map(s => {
        const currentStatut = s.utilisateur_saisons?.[0]?.statut_saison || 'Pas commencée';
        const options = statuts.map(st => 
            `<option value="${st}" ${currentStatut === st ? 'selected' : ''}>${st}</option>`
        ).join('');

        return `
            <div class="saison-item">
                <div class="saison-item-info">
                    <span class="saison-item-titre">Saison ${s.numero_saison}</span>
                    <span class="saison-item-episodes">${s.nombre_episodes} épisodes</span>
                </div>
                <select 
                    class="saison-statut-select" 
                    data-saison-id="${s.id}"
                    aria-label="Statut de la saison ${s.numero_saison}"
                >
                    ${options}
                </select>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}
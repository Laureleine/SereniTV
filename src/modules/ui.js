import {
    filterSeries,
    fetchSeries,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { state } from './ui/state.js';
import { renderSeries } from './ui/catalogRender.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
import { fermerModal, onConfirmerModal } from './ui/modal.js';
import { onStatutChange, onSaisonStatutChange } from './ui/statusHandlers.js';

// ─────────────────────────────────────────────
// INITIALISATION
// ─────────────────────────────────────────────

export function initUI() {
    const overlay = document.getElementById('mode-selection-overlay');
    const btnTv = document.getElementById('btn-select-tv');
    const btnRemote = document.getElementById('btn-select-remote');
    const btnPc = document.getElementById('btn-select-pc');

    if (overlay && btnTv && btnRemote && btnPc) {
        btnTv.addEventListener('click', () => {
            state.currentMode = 'tv';
            document.body.classList.add('is-tv-mode');
            overlay.classList.add('hidden');
            initRealtimeZapping(
                (payload) => {
                    console.log('[REALTIME TV] Événement reçu, mise à jour du catalogue en cours.');
                    state.tvPreviewOverride = null; // Réinitialise la prévisualisation pour afficher la série suivante
                },
                (watchUrl) => {
                    console.log('[REALTIME TV] Lancement demandé via mobile! URL:', watchUrl);
                    window.location.href = watchUrl;
                },
                (series) => {
                    console.log('[REALTIME TV] Preview demandée pour la série :', series ? series.titre : 'null (clear)');
                    state.tvPreviewOverride = series;
                    renderSeries(state.dernierRenduSeries);
                }
            );
            fetchSeries();
        });

        btnRemote.addEventListener('click', () => {
            state.currentMode = 'remote';
            document.body.classList.add('is-remote-mode');
            overlay.classList.add('hidden');
            fetchSeries();
        });

        btnPc.addEventListener('click', () => {
            state.currentMode = 'pc';
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
        if (state.currentMode === 'tv' || state.currentMode === 'remote') return;
        
        // Ignorer si on clique sur un select, un bouton ou le panneau de saisons déjà ouvert
        if (e.target.closest('select') || e.target.closest('button') || e.target.closest('.saisons-panel')) {
            return;
        }

        const card = e.target.closest('.serie-card');
        if (card) {
            toggleSaisonsPanel(card.dataset.serieId, card);
        }
    });

    // Boutons de la télécommande / Zapping mobile (Triage optimiste 0ms)
    const btnNo = document.getElementById('remote-no');
    const btnMaybe = document.getElementById('remote-maybe');
    const btnYes = document.getElementById('remote-yes');

    if (btnNo && btnMaybe && btnYes) {
        const optimisteTriage = (id, statut, triggerPreview = false) => {
            // Retrouver la série active avant de la retirer
            const activeSerie = state.dernierRenduSeries.find(s => s.id === id);

            // 1. Mise à jour visuelle instantanée
            const index = state.dernierRenduSeries.findIndex(s => s.id === id);
            if (index !== -1) {
                state.dernierRenduSeries.splice(index, 1);
                renderSeries(state.dernierRenduSeries);
            }

            // 2. Diffuser preview ou clear preview
            if (triggerPreview && activeSerie) {
                diffuserSignalPreview(activeSerie);
            } else {
                diffuserSignalPreview(null);
            }

            // 3. Enregistrement asynchrone en arrière-plan sans bloquer
            updateStatutGlobal(id, statut, MOCK_USER_ID).then((result) => {
                if (!result.success) {
                    console.error(`[OPTIMISTE] Échec de l'enregistrement de la série ${id} (${statut})`);
                }
            });
        };

        btnNo.addEventListener('click', () => {
            const firstCard = document.querySelector('.serie-card');
            if (!firstCard) return;
            const id = parseInt(firstCard.dataset.serieId);
            // NON = Sans intérêt (Ignorées)
            optimisteTriage(id, 'Sans intérêt', false);
        });

        btnMaybe.addEventListener('click', () => {
            const firstCard = document.querySelector('.serie-card');
            if (!firstCard) return;
            const id = parseInt(firstCard.dataset.serieId);
            // PEUT-ÊTRE = Peut-être
            optimisteTriage(id, 'Peut-être', false);
        });

        btnYes.addEventListener('click', () => {
            const firstCard = document.querySelector('.serie-card');
            if (!firstCard) return;
            const id = parseInt(firstCard.dataset.serieId);
            // OUI = En cours (avec prévisualisation cinéma sur la télé)
            optimisteTriage(id, 'En cours', true);
        });
    }

    // Intercepter le clic sur le bouton Lancer sur Netflix pour diffuser le signal à la TV
    container.addEventListener('click', (e) => {
        const btnLaunch = e.target.closest('.btn-netflix-launch');
        if (btnLaunch && state.currentMode === 'remote') {
            e.preventDefault();
            const watchUrl = btnLaunch.dataset.watchUrl;
            if (watchUrl) {
                console.log('[TELECOMMANDE] Diffusion du signal de lancement Netflix (exclusif) :', watchUrl);
                diffuserSignalLancement(watchUrl);
            }
        }
    });

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

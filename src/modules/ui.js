import {
    filterSeries,
    fetchSeries,
    updateStatutGlobal,
    setPlatformFilter,
    setSortOrder,
    getCurrentSortOrder,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    getCurrentUserId,
} from './series.js';
import { state } from './ui/state.js';
import { renderSeries, updateRemoteDeckVisibility } from './ui/catalogRender.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
import { fermerModal, onConfirmerModal } from './ui/modal.js';
import { onStatutChange, onSaisonStatutChange } from './ui/statusHandlers.js';
import { initSearchBar } from './ui/searchBar.js';
import { getSavedMode, saveMode, clearSavedMode } from './ui/deviceMode.js';
import { initChangelogBadge } from './ui/changelog.js';
import { showToast } from './ui/toast.js';
import { initThemeFilter } from './ui/themeFilter.js';
import { initFeedback } from './ui/feedback.js';

// ─────────────────────────────────────────────
// INITIALISATION
// ─────────────────────────────────────────────

/**
 * Active un mode (TV / Télécommande / PC) : bascule l'état, les classes CSS,
 * le câblage temps réel si nécessaire, puis recharge le catalogue.
 * Utilisé à la fois par les boutons de l'overlay et par la reprise automatique
 * du rôle mémorisé sur cet appareil.
 * @param {'tv'|'remote'|'pc'} mode
 */
function activerMode(mode) {
    state.currentMode = mode;

    if (mode === 'tv') {
        document.body.classList.add('is-tv-mode');
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
    } else if (mode === 'remote') {
        document.body.classList.add('is-remote-mode');
    }

    fetchSeries();
}

export function initUI() {
    const overlay = document.getElementById('mode-selection-overlay');
    const btnTv = document.getElementById('btn-select-tv');
    const btnRemote = document.getElementById('btn-select-remote');
    const btnPc = document.getElementById('btn-select-pc');

    const savedMode = getSavedMode();

    if (savedMode) {
        // Rôle déjà mémorisé sur cet appareil : on ne montre pas l'overlay.
        if (overlay) overlay.classList.add('hidden');
        activerMode(savedMode);
    } else if (overlay && btnTv && btnRemote && btnPc) {
        overlay.classList.remove('hidden');

        btnTv.addEventListener('click', () => {
            saveMode('tv');
            overlay.classList.add('hidden');
            activerMode('tv');
        });

        btnRemote.addEventListener('click', () => {
            saveMode('remote');
            overlay.classList.add('hidden');
            activerMode('remote');
        });

        btnPc.addEventListener('click', () => {
            saveMode('pc');
            overlay.classList.add('hidden');
            activerMode('pc');
        });
    }

    // Réinitialisation du rôle mémorisé (visible dans les 3 modes)
    const btnResetMode = document.getElementById('btn-reset-mode');
    if (btnResetMode) {
        btnResetMode.addEventListener('click', () => {
            clearSavedMode();
            window.location.reload();
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

    // Tri du catalogue
    const sortOrderSelect = document.getElementById('sort-order-select');
    if (sortOrderSelect) {
        sortOrderSelect.value = getCurrentSortOrder();
        sortOrderSelect.addEventListener('change', (e) => {
            setSortOrder(e.target.value);
        });
    }

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
        
        // Ignorer si on clique sur un select, un bouton, le panneau de saisons déjà ouvert,
        // ou la zone des thèmes (ajout/retrait)
        if (e.target.closest('select') || e.target.closest('button') || e.target.closest('.saisons-panel') || e.target.closest('.serie-themes')) {
            return;
        }

        const card = e.target.closest('.serie-card');
        if (card) {
            toggleSaisonsPanel(card.dataset.serieId, card);
        }
    });

    // Clavier (Entrée/Espace) : même accordéon, pour les utilisateurs clavier/lecteur d'écran
    container.addEventListener('keydown', (e) => {
        if (state.currentMode === 'tv' || state.currentMode === 'remote') return;
        if (e.key !== 'Enter' && e.key !== ' ') return;

        if (e.target.closest('select') || e.target.closest('button') || e.target.closest('.saisons-panel') || e.target.closest('.serie-themes')) {
            return;
        }

        const card = e.target.closest('.serie-card');
        if (card) {
            e.preventDefault();
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
            updateStatutGlobal(id, statut, getCurrentUserId()).then((result) => {
                if (!result.success) {
                    console.error(`[OPTIMISTE] Échec de l'enregistrement de la série ${id} (${statut})`);
                    showToast("Échec de l'enregistrement, la série reste à classer.");
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

    // Masquer/réafficher la fenêtre Oui/Non/Peut-être (mode PC uniquement)
    const btnHideDeck = document.getElementById('remote-deck-hide');
    const btnShowDeck = document.getElementById('remote-deck-show');

    if (btnHideDeck) {
        btnHideDeck.addEventListener('click', () => {
            state.remoteDeckHiddenByUser = true;
            updateRemoteDeckVisibility(state.dernierRenduSeries.length);
        });
    }

    if (btnShowDeck) {
        btnShowDeck.addEventListener('click', () => {
            state.remoteDeckHiddenByUser = false;
            updateRemoteDeckVisibility(state.dernierRenduSeries.length);
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

    // Badge de version + notes de version
    initChangelogBadge();

    // Filtre par thème + gestion des thèmes sur les cartes
    initThemeFilter();

    // Feedback (testeurs) + panneau admin (propriétaire uniquement)
    initFeedback();
}

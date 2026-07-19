import { fetchSeries } from '../series.js';
import { getPlayLink } from './playLink.js';
import { state } from './state.js';

const STATUTS_VISIONNAGE = ['A voir', 'En cours', 'Terminée', 'Abandonnée', 'Sans intérêt', 'Peut-être'];

/**
 * Affiche un état d'erreur avec bouton de reprise quand le chargement du catalogue échoue
 * (ex : coupure réseau, Supabase indisponible).
 */
export function renderFetchError() {
    const container = document.getElementById('series-container');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state empty-state--error">
            <p>Impossible de charger vos séries. Vérifiez votre connexion.</p>
            <button id="btn-retry-fetch" class="btn btn--primary">Réessayer</button>
        </div>
    `;

    document.getElementById('btn-retry-fetch').addEventListener('click', () => fetchSeries());
}

export function renderSeries(seriesList) {
    state.dernierRenduSeries = [...seriesList];

    const container = document.getElementById('series-container');
    container.innerHTML = '';

    const isTvMode = state.currentMode === 'tv';
    const isRemoteMode = state.currentMode === 'remote';

    // Gestion du fond d'écran Cinéma pour le Mode TV
    const tvBackdrop = document.getElementById('tv-backdrop');
    if (tvBackdrop) {
        const activeSerie = (isTvMode && state.tvPreviewOverride) || ((isTvMode || isRemoteMode) ? seriesList[0] : null);
        if (isTvMode && activeSerie && activeSerie.backdrop_path) {
            const backdropUrl = `https://image.tmdb.org/t/p/w1280${activeSerie.backdrop_path}`;
            tvBackdrop.style.backgroundImage = `linear-gradient(to top, #111 15%, rgba(17, 17, 17, 0.85) 100%), url(${backdropUrl})`;
            tvBackdrop.classList.add('is-active');
        } else {
            tvBackdrop.style.backgroundImage = '';
            tvBackdrop.classList.remove('is-active');
        }
    }

    if (isTvMode || isRemoteMode) {
        const activeSerie = (isTvMode && state.tvPreviewOverride) || seriesList[0];
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
                </div>
                ${activeSerie.plateforme ? `<div class="serie-platform-badge">${activeSerie.plateforme}</div>` : ''}
                <p class="serie-synopsis">${activeSerie.synopsis || 'Aucun résumé disponible.'}</p>
                ${(() => {
                    const playLink = getPlayLink(activeSerie);
                    return isTvMode ? `
                        <a href="${playLink.url}" class="btn-netflix-launch btn-launch-${playLink.class}">
                            🍿 Lancer sur ${playLink.name}
                        </a>
                    ` : `
                        <button data-watch-url="${playLink.url}" class="btn-netflix-launch btn-launch-${playLink.class}">
                            📺 Lancer sur la Télévision
                        </button>
                    `;
                })()}
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
                        ${STATUTS_VISIONNAGE.map(s => {
                            const label = s === 'Sans intérêt' ? 'Ignorée' : (s === 'A voir' ? 'À voir' : s);
                            return `<option value="${s}" ${serie.statut_visionnage === s ? 'selected' : ''}>${label}</option>`;
                        }).join('')}
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
    const remoteDeck = document.getElementById('remote-deck');
    if (!remoteDeck) return;

    const activeNavBtn = document.querySelector('.nav-btn.active');
    const isInboxTab = activeNavBtn && activeNavBtn.dataset.filter === 'all';

    // Si on est en mode télécommande OU (mode PC et onglet Inbox avec des séries)
    if (state.currentMode === 'remote' || (state.currentMode === 'pc' && isInboxTab && seriesCount > 0)) {
        remoteDeck.hidden = false;
    } else {
        remoteDeck.hidden = true;
    }
}

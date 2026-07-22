import { rechercherSeriesTMDB, synchroniserSerieAvecTMDB, fetchSeries, marquerAjoutManuel } from '../series.js';
import { escapeHtml } from './escapeHtml.js';

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
export function initSearchBar() {
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
                <span class="suggestion-titre">${escapeHtml(r.titre)}</span>
                ${r.titre_orig ? `<span class="suggestion-titre-orig">${escapeHtml(r.titre_orig)}</span>` : ''}
                <span class="suggestion-annee">${escapeHtml(r.annee)}</span>
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
        const serie = await synchroniserSerieAvecTMDB(suggestion.tmdbId);
        marquerAjoutManuel(serie.id);
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

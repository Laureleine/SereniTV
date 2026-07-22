import { fetchAllThemes, toggleThemeFilter, getCurrentThemeFilter, ajouterThemeSerie, retirerThemeSerie, fetchSeries } from '../series.js';
import { escapeHtml } from './escapeHtml.js';

let allThemes = [];

/**
 * Initialise la rangée de filtres par thème et l'ajout/retrait de thèmes
 * directement depuis chaque carte du catalogue.
 */
export async function initThemeFilter() {
    await refreshThemesList();

    const filterRow = document.getElementById('theme-filter-row');
    if (filterRow) {
        filterRow.addEventListener('click', (e) => {
            const chip = e.target.closest('.theme-filter-chip');
            if (!chip) return;
            chip.classList.toggle('is-active');
            toggleThemeFilter(parseInt(chip.dataset.themeId));
        });
    }

    const container = document.getElementById('series-container');
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const addBtn = e.target.closest('.theme-chip--add');
        if (addBtn) {
            const wrapper = addBtn.closest('.serie-themes');
            const input = wrapper.querySelector('.theme-add-input');
            addBtn.hidden = true;
            input.hidden = false;
            input.focus();
            return;
        }

        const removeBtn = e.target.closest('.theme-chip__remove');
        if (removeBtn) {
            const wrapper = removeBtn.closest('.serie-themes');
            const serieId = parseInt(wrapper.dataset.serieId);
            const themeId = parseInt(removeBtn.dataset.themeId);
            const result = await retirerThemeSerie(serieId, themeId);
            if (result.success) await fetchSeries();
            return;
        }
    });

    container.addEventListener('keydown', async (e) => {
        if (!e.target.classList.contains('theme-add-input')) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            cancelAddInput(e.target);
            return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();

        const wrapper = e.target.closest('.serie-themes');
        const serieId = parseInt(wrapper.dataset.serieId);
        const nomTheme = e.target.value.trim();
        if (!nomTheme) {
            cancelAddInput(e.target);
            return;
        }

        const result = await ajouterThemeSerie(serieId, nomTheme);
        if (result.success) {
            await refreshThemesList();
            await fetchSeries();
        } else {
            cancelAddInput(e.target);
        }
    });

    container.addEventListener('focusout', (e) => {
        if (e.target.classList.contains('theme-add-input')) {
            cancelAddInput(e.target);
        }
    });
}

function cancelAddInput(input) {
    const wrapper = input.closest('.serie-themes');
    if (!wrapper) return;
    input.value = '';
    input.hidden = true;
    const addBtn = wrapper.querySelector('.theme-chip--add');
    if (addBtn) addBtn.hidden = false;
}

async function refreshThemesList() {
    allThemes = await fetchAllThemes();
    renderFilterRow();
    renderDatalist();
}

function renderFilterRow() {
    const container = document.getElementById('theme-filter-row');
    if (!container) return;
    const selected = getCurrentThemeFilter();
    container.innerHTML = allThemes.map(t => `
        <button type="button" class="theme-filter-chip ${selected.includes(t.id) ? 'is-active' : ''}" data-theme-id="${t.id}">
            ${escapeHtml(t.nom_theme)}
        </button>
    `).join('');
}

function renderDatalist() {
    const datalist = document.getElementById('theme-suggestions');
    if (!datalist) return;
    datalist.innerHTML = allThemes.map(t => `<option value="${escapeHtml(t.nom_theme)}"></option>`).join('');
}

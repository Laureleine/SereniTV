import { CHANGELOG, APP_VERSION } from '../changelogData.js';
import { trapFocus } from './focusTrap.js';

/**
 * Affiche le badge de version et câble l'ouverture/fermeture du panneau
 * de notes de version.
 */
export function initChangelogBadge() {
    const badge = document.getElementById('version-badge');
    const overlay = document.getElementById('changelog-overlay');
    const modal = document.getElementById('changelog-modal');
    const listEl = document.getElementById('changelog-list');
    const btnFermer = document.getElementById('changelog-fermer');

    if (!badge || !overlay || !modal || !listEl) return;

    badge.textContent = `v${APP_VERSION}`;
    badge.setAttribute('aria-label', `v${APP_VERSION} — voir les notes de version`);

    let rendered = false;
    const renderList = () => {
        if (rendered) return;
        listEl.innerHTML = CHANGELOG.map(entry => `
            <div class="changelog-entry">
                <div class="changelog-entry-header">
                    <span class="changelog-entry-version">v${entry.version}</span>
                    <span class="changelog-entry-date">${entry.date}</span>
                </div>
                <ul class="changelog-entry-changes">
                    ${entry.changes.map(change => `<li>${change}</li>`).join('')}
                </ul>
            </div>
        `).join('');
        rendered = true;
    };

    let releaseFocus = null;

    const ouvrir = () => {
        renderList();
        overlay.classList.add('is-visible');
        modal.classList.add('is-visible');
        releaseFocus = trapFocus(modal, fermer);
    };

    const fermer = () => {
        overlay.classList.remove('is-visible');
        modal.classList.remove('is-visible');
        if (releaseFocus) {
            releaseFocus();
            releaseFocus = null;
        }
    };

    badge.addEventListener('click', ouvrir);
    btnFermer.addEventListener('click', fermer);
    overlay.addEventListener('click', fermer);
}

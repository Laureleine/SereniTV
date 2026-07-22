import { CHANGELOG, APP_VERSION } from '../changelogData.js';
import { trapFocus } from './focusTrap.js';

let rendered = false;
let releaseFocus = null;

function renderList(listEl) {
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
}

/**
 * Ouvre le panneau des notes de version. Utilisable depuis n'importe où
 * (badge dans l'appli, lien "Changelog" sur la landing page publique).
 */
export function ouvrirChangelog() {
    const overlay = document.getElementById('changelog-overlay');
    const modal = document.getElementById('changelog-modal');
    const listEl = document.getElementById('changelog-list');
    if (!overlay || !modal || !listEl) return;

    renderList(listEl);
    overlay.classList.add('is-visible');
    modal.classList.add('is-visible');
    releaseFocus = trapFocus(modal, fermerChangelog);
}

export function fermerChangelog() {
    const overlay = document.getElementById('changelog-overlay');
    const modal = document.getElementById('changelog-modal');
    overlay?.classList.remove('is-visible');
    modal?.classList.remove('is-visible');
    if (releaseFocus) {
        releaseFocus();
        releaseFocus = null;
    }
}

/**
 * Câble la fermeture du modal (croix, clic sur l'overlay). Indépendant de
 * l'état de connexion : appelé une fois au démarrage pour que le lien
 * "Changelog" de la landing page (avant toute connexion) fonctionne aussi.
 */
export function initChangelogModal() {
    const overlay = document.getElementById('changelog-overlay');
    const btnFermer = document.getElementById('changelog-fermer');
    btnFermer?.addEventListener('click', fermerChangelog);
    overlay?.addEventListener('click', fermerChangelog);
}

/**
 * Câble le badge de version affiché dans l'appli (texte, clic).
 */
export function initChangelogBadge() {
    const badge = document.getElementById('version-badge');
    if (!badge) return;
    badge.textContent = `v${APP_VERSION}`;
    badge.setAttribute('aria-label', `v${APP_VERSION} — voir les notes de version`);
    badge.addEventListener('click', ouvrirChangelog);
}

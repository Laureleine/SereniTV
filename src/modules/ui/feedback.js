import { fetchFeedback, soumettreFeedback, changerStatutFeedback, fetchProfilsEnAttente, approuverUtilisateur, refuserUtilisateur, estProprietaire } from '../access.js';
import { escapeHtml } from './escapeHtml.js';
import { trapFocus } from './focusTrap.js';

const STATUTS = ['Idées', 'Prévu', 'En cours', 'Fait', 'Refusé'];

let currentTypeFilter = 'all';
let allFeedback = [];
let releaseFocusFeedback = null;
let releaseFocusAdmin = null;

/**
 * Câble les boutons flottants Feedback / Admin et les deux panneaux associés.
 * Le bouton Admin ne s'affiche que pour le compte propriétaire.
 */
export function initFeedback() {
    const btnOpen = document.getElementById('btn-open-feedback');
    const btnAdmin = document.getElementById('btn-open-admin');
    const overlay = document.getElementById('feedback-overlay');
    const btnFermer = document.getElementById('feedback-fermer');
    const btnNouvelle = document.getElementById('feedback-nouvelle-demande');
    const formWrap = document.getElementById('feedback-form-wrap');
    const form = document.getElementById('feedback-form');
    const btnAnnuler = document.getElementById('feedback-annuler');
    const filtersRow = document.getElementById('feedback-filters');
    const adminOverlay = document.getElementById('admin-overlay');
    const adminFermer = document.getElementById('admin-fermer');

    if (btnOpen) {
        btnOpen.hidden = false;
        btnOpen.addEventListener('click', ouvrirFeedback);
    }
    if (btnAdmin && estProprietaire()) {
        btnAdmin.hidden = false;
        btnAdmin.addEventListener('click', ouvrirAdmin);
    }

    btnFermer?.addEventListener('click', fermerFeedback);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) fermerFeedback(); });

    adminFermer?.addEventListener('click', fermerAdmin);
    adminOverlay?.addEventListener('click', (e) => { if (e.target === adminOverlay) fermerAdmin(); });

    btnNouvelle?.addEventListener('click', () => {
        formWrap.hidden = false;
        document.getElementById('feedback-titre')?.focus();
    });

    btnAnnuler?.addEventListener('click', () => {
        formWrap.hidden = true;
        form.reset();
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('feedback-type').value;
        const titre = document.getElementById('feedback-titre').value.trim();
        const description = document.getElementById('feedback-description').value.trim();
        if (!titre) return;

        const result = await soumettreFeedback(type, titre, description);
        if (result.success) {
            form.reset();
            formWrap.hidden = true;
            await rechargerFeedback();
        }
    });

    filtersRow?.addEventListener('click', (e) => {
        const btn = e.target.closest('.feedback-filter');
        if (!btn) return;
        filtersRow.querySelectorAll('.feedback-filter').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentTypeFilter = btn.dataset.type;
        renderKanban();
    });
}

async function ouvrirFeedback() {
    const overlay = document.getElementById('feedback-overlay');
    overlay.classList.remove('hidden');
    releaseFocusFeedback = trapFocus(overlay.querySelector('.portal-card'), fermerFeedback);
    await rechargerFeedback();
}

function fermerFeedback() {
    document.getElementById('feedback-overlay')?.classList.add('hidden');
    if (releaseFocusFeedback) {
        releaseFocusFeedback();
        releaseFocusFeedback = null;
    }
}

async function rechargerFeedback() {
    allFeedback = await fetchFeedback();
    renderKanban();
}

function renderKanban() {
    const board = document.getElementById('kanban-board');
    if (!board) return;

    const filtered = currentTypeFilter === 'all'
        ? allFeedback
        : allFeedback.filter(f => f.type === currentTypeFilter);

    const proprietaire = estProprietaire();

    board.innerHTML = STATUTS.map(statut => {
        const items = filtered.filter(f => f.statut === statut);
        return `
            <div class="kanban-column">
                <div class="kanban-column__title">${statut} (${items.length})</div>
                ${items.map(f => `
                    <div class="kanban-card">
                        <span class="kanban-card__type">${escapeHtml(f.type)}</span>
                        <div class="kanban-card__titre">${escapeHtml(f.titre)}</div>
                        ${f.description ? `<div class="kanban-card__description">${escapeHtml(f.description)}</div>` : ''}
                        ${proprietaire ? `
                            <div class="kanban-card__actions">
                                ${STATUTS.filter(s => s !== statut).map(s => `
                                    <button type="button" data-move-to="${s}" data-feedback-id="${f.id}">${s}</button>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');

    if (proprietaire) {
        board.querySelectorAll('[data-move-to]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const feedbackId = parseInt(btn.dataset.feedbackId);
                const statut = btn.dataset.moveTo;
                const result = await changerStatutFeedback(feedbackId, statut);
                if (result.success) await rechargerFeedback();
            });
        });
    }
}

// ── Panneau admin (inscriptions en attente) ──

async function ouvrirAdmin() {
    const overlay = document.getElementById('admin-overlay');
    overlay.classList.remove('hidden');
    releaseFocusAdmin = trapFocus(overlay.querySelector('.portal-card'), fermerAdmin);
    await rechargerAdmin();
}

function fermerAdmin() {
    document.getElementById('admin-overlay')?.classList.add('hidden');
    if (releaseFocusAdmin) {
        releaseFocusAdmin();
        releaseFocusAdmin = null;
    }
}

async function rechargerAdmin() {
    const pendingList = document.getElementById('admin-pending-list');
    if (!pendingList) return;

    const pending = await fetchProfilsEnAttente();
    pendingList.innerHTML = pending.length === 0
        ? '<p class="admin-empty">Aucune demande en attente.</p>'
        : pending.map(p => `
            <div class="admin-list-item">
                <div class="admin-list-item__info">
                    <strong>${escapeHtml(p.email)}</strong>
                    ${p.motivation ? `<div class="admin-list-item__motivation">${escapeHtml(p.motivation)}</div>` : ''}
                </div>
                <div class="admin-list-item__actions">
                    <button type="button" data-approve="${p.id}">Approuver</button>
                    <button type="button" data-reject="${p.id}">Refuser</button>
                </div>
            </div>
        `).join('');

    pendingList.querySelectorAll('[data-approve]').forEach(btn => {
        btn.addEventListener('click', async () => {
            await approuverUtilisateur(btn.dataset.approve);
            await rechargerAdmin();
        });
    });
    pendingList.querySelectorAll('[data-reject]').forEach(btn => {
        btn.addEventListener('click', async () => {
            await refuserUtilisateur(btn.dataset.reject);
            await rechargerAdmin();
        });
    });
}

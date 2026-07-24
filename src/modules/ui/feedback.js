import { fetchFeedback, soumettreFeedback, changerStatutFeedback, fetchProfilsEnAttente, approuverUtilisateur, refuserUtilisateur, estProprietaire, getParametresAdmin, setNotifierNouvellesInscriptions, fetchCommentaires, ajouterCommentaire, getStatsVisites } from '../access.js';
import { escapeHtml } from './escapeHtml.js';
import { trapFocus } from './focusTrap.js';

const STATUTS = ['Idées', 'Prévu', 'En cours', 'Fait', 'Refusé'];

let currentTypeFilter = 'all';
let allFeedback = [];
let allCommentaires = [];
const discussionsOuvertes = new Set();
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

    document.getElementById('admin-toggle-notif')?.addEventListener('change', async (e) => {
        await setNotifierNouvellesInscriptions(e.target.checked);
    });

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
    releaseFocusFeedback = trapFocus(overlay, fermerFeedback);
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
    [allFeedback, allCommentaires] = await Promise.all([fetchFeedback(), fetchCommentaires()]);
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
                ${items.map(f => {
                    const commentaires = allCommentaires.filter(c => c.retour_id === f.id);
                    const ouverte = discussionsOuvertes.has(f.id);
                    return `
                    <div class="kanban-card">
                        <div class="kanban-card__header">
                            <span class="kanban-card__id">#${f.id}</span>
                            <span class="kanban-card__type">${escapeHtml(f.type)}</span>
                        </div>
                        <div class="kanban-card__titre">${escapeHtml(f.titre)}</div>
                        ${f.description ? `<div class="kanban-card__description">${escapeHtml(f.description)}</div>` : ''}
                        <div class="kanban-card__actions">
                            <button type="button" class="kanban-card__copy" data-copy-id="${f.id}">Copier</button>
                            <button type="button" class="kanban-card__discussion-toggle" data-toggle-discussion="${f.id}">💬 Discussion (${commentaires.length})</button>
                            ${proprietaire ? STATUTS.filter(s => s !== statut).map(s => `
                                <button type="button" data-move-to="${s}" data-feedback-id="${f.id}">${s}</button>
                            `).join('') : ''}
                        </div>
                        ${ouverte ? `
                            <div class="kanban-discussion">
                                ${commentaires.length === 0 ? '<p class="kanban-discussion__empty">Aucun message pour l\'instant.</p>' : commentaires.map(c => `
                                    <div class="kanban-discussion__message kanban-discussion__message--${c.auteur}">
                                        <span class="kanban-discussion__auteur">${c.auteur === 'assistant' ? 'Claude' : 'Toi'}</span>
                                        <p>${escapeHtml(c.message)}</p>
                                    </div>
                                `).join('')}
                                ${proprietaire ? `
                                    <form class="kanban-discussion__form" data-reply-id="${f.id}">
                                        <textarea class="auth-input auth-textarea" rows="2" placeholder="Répondre…" required></textarea>
                                        <button type="submit" class="btn portal-btn">Envoyer</button>
                                    </form>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
                }).join('')}
            </div>
        `;
    }).join('');

    board.querySelectorAll('[data-copy-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const feedbackId = parseInt(btn.dataset.copyId);
            const f = allFeedback.find(item => item.id === feedbackId);
            if (!f) return;
            const texte = `#${f.id} — ${f.type}\nTitre : ${f.titre}\nDescription : ${f.description || '(aucune)'}\nStatut : ${f.statut}`;
            try {
                await navigator.clipboard.writeText(texte);
                const original = btn.textContent;
                btn.textContent = 'Copié !';
                setTimeout(() => { btn.textContent = original; }, 1500);
            } catch (err) {
                console.error('[FEEDBACK] Erreur copie presse-papiers:', err);
            }
        });
    });

    board.querySelectorAll('[data-toggle-discussion]').forEach(btn => {
        btn.addEventListener('click', () => {
            const feedbackId = parseInt(btn.dataset.toggleDiscussion);
            if (discussionsOuvertes.has(feedbackId)) {
                discussionsOuvertes.delete(feedbackId);
            } else {
                discussionsOuvertes.add(feedbackId);
            }
            renderKanban();
        });
    });

    board.querySelectorAll('[data-reply-id]').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedbackId = parseInt(form.dataset.replyId);
            const textarea = form.querySelector('textarea');
            const message = textarea.value.trim();
            if (!message) return;

            const result = await ajouterCommentaire(feedbackId, message);
            if (result.success) await rechargerFeedback();
        });
    });

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

    const parametres = await getParametresAdmin();
    const toggle = document.getElementById('admin-toggle-notif');
    if (toggle) toggle.checked = parametres?.notifier_nouvelles_inscriptions ?? true;

    await afficherStatsVisites();
    await rechargerAdmin();
}

async function afficherStatsVisites() {
    const conteneur = document.getElementById('admin-stats-visites');
    if (!conteneur) return;

    const stats = await getStatsVisites();
    if (!stats) {
        conteneur.innerHTML = '<p class="admin-empty">Impossible de charger les statistiques.</p>';
        return;
    }

    conteneur.innerHTML = `
        <div class="admin-stat"><span class="admin-stat__valeur">${stats.total}</span><span class="admin-stat__label">Total</span></div>
        <div class="admin-stat"><span class="admin-stat__valeur">${stats.connus}</span><span class="admin-stat__label">Connus</span></div>
        <div class="admin-stat"><span class="admin-stat__valeur">${stats.autres}</span><span class="admin-stat__label">Autres</span></div>
    `;
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

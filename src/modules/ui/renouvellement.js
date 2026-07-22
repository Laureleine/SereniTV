import { updateStatutGlobal, fetchSeries, getCurrentUserId } from '../series.js';
import { showToast } from './toast.js';
import { trapFocus } from './focusTrap.js';
import { escapeHtml } from './escapeHtml.js';

let _releaseFocus = null;

/**
 * Affiche une modale listant les séries suivies/terminées ayant reçu une
 * nouvelle saison, avec la possibilité de basculer chacune vers "À voir".
 * @param {Array<{serieId: number, titre: string, statutActuel: string}>} liste
 */
export function afficherPopupNouvellesSaisons(liste) {
    if (!liste || liste.length === 0) return;

    const overlay = document.getElementById('modal-overlay-renouvellement');
    const modal = document.getElementById('modal-renouvellement');
    const conteneur = document.getElementById('renouvellement-liste');
    const btnFermer = document.getElementById('renouvellement-fermer');

    conteneur.innerHTML = liste.map(item => `
        <div class="renouvellement-item" data-serie-id="${item.serieId}">
            <span class="renouvellement-item__titre">${escapeHtml(item.titre)}</span>
            <div class="renouvellement-item__actions">
                <button type="button" class="btn btn--ghost btn--small" data-action="garder">Garder en ${escapeHtml(item.statutActuel)}</button>
                <button type="button" class="btn btn--primary btn--small" data-action="a-voir">Basculer vers À voir</button>
            </div>
        </div>
    `).join('');

    const fermerSiVide = () => {
        if (conteneur.children.length === 0) fermerPopup();
    };

    conteneur.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const item = btn.closest('.renouvellement-item');
            const serieId = parseInt(item.dataset.serieId);

            if (btn.dataset.action === 'a-voir') {
                btn.disabled = true;
                btn.textContent = '…';
                const result = await updateStatutGlobal(serieId, 'A voir', getCurrentUserId());
                if (!result.success) {
                    showToast("Échec de l'enregistrement, réessayez.");
                    btn.disabled = false;
                    btn.textContent = 'Basculer vers À voir';
                    return;
                }
                await fetchSeries();
            }

            item.remove();
            fermerSiVide();
        });
    });

    overlay.classList.add('is-visible');
    modal.classList.add('is-visible');
    _releaseFocus = trapFocus(modal, fermerPopup);

    btnFermer.onclick = fermerPopup;
    overlay.onclick = fermerPopup;
}

function fermerPopup() {
    document.getElementById('modal-overlay-renouvellement').classList.remove('is-visible');
    document.getElementById('modal-renouvellement').classList.remove('is-visible');
    if (_releaseFocus) {
        _releaseFocus();
        _releaseFocus = null;
    }
}

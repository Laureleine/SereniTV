import { getSaisonsAvecStatut, getCurrentUserId } from '../series.js';

/**
 * Ouvre/ferme le panneau des saisons d'une carte série, en chargeant les
 * saisons à la demande lors du premier affichage.
 */
export async function toggleSaisonsPanel(serieId, card) {
    const panel = document.getElementById(`saisons-panel-${serieId}`);
    const contentDiv = document.getElementById(`saisons-content-${serieId}`);

    if (!panel) return;

    const isOpen = !panel.hidden;

    if (isOpen) {
        panel.hidden = true;
        card.classList.remove('is-expanded');
        card.setAttribute('aria-expanded', 'false');
    } else {
        panel.hidden = false;
        card.classList.add('is-expanded');
        card.setAttribute('aria-expanded', 'true');

        if (contentDiv.querySelector('.saisons-loading')) {
            try {
                const saisons = await getSaisonsAvecStatut(serieId, getCurrentUserId());
                renderSaisonsList(contentDiv, saisons);
            } catch (err) {
                console.error("Erreur chargement saisons:", err);
                contentDiv.innerHTML = '<div class="saisons-error">Erreur lors du chargement des saisons.</div>';
            }
        }
    }
}

function renderSaisonsList(container, saisons) {
    if (!saisons || saisons.length === 0) {
        container.innerHTML = '<div class="saisons-empty">Aucune saison disponible.</div>';
        return;
    }

    const statuts = ['Pas commencée', 'En cours', 'Terminée'];

    const html = saisons.map(s => {
        const currentStatut = s.utilisateur_saisons?.[0]?.statut_saison || 'Pas commencée';
        const options = statuts.map(st =>
            `<option value="${st}" ${currentStatut === st ? 'selected' : ''}>${st}</option>`
        ).join('');

        return `
            <div class="saison-item">
                <div class="saison-item-info">
                    <span class="saison-item-titre">Saison ${s.numero_saison}</span>
                    <span class="saison-item-episodes">${s.nombre_episodes} épisodes</span>
                </div>
                <select
                    class="saison-statut-select"
                    data-saison-id="${s.id}"
                    aria-label="Statut de la saison ${s.numero_saison}"
                >
                    ${options}
                </select>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

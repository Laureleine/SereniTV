import { getSaisonsAvecStatut, abandonnerSerie, demarrerSerie, fetchSeries, getCurrentUserId } from '../series.js';
import { showToast } from './toast.js';

let _modalContext = null;

/**
 * Ouvre le modal générique (abandon ou démarrage) après avoir chargé les saisons de la série.
 * @param {object} config
 */
export async function ouvrirModal(config) {
    const { serieId, serieTitre, selectElement, mode, titre, description, labelBtn, finalStatut } = config;

    try {
        const saisons = await getSaisonsAvecStatut(serieId, getCurrentUserId());

        if (!saisons || saisons.length === 0) {
            showToast("Cette série n'a aucune saison enregistrée.");
            selectElement.value = '';
            return;
        }

        _modalContext = { serieId, serieTitre, selectElement, mode, finalStatut, labelBtn };

        document.getElementById('modal-titre').textContent      = titre;
        document.getElementById('modal-serie-titre').textContent = serieTitre;
        document.getElementById('modal-description-label').textContent = description;
        document.getElementById('modal-confirmer').textContent  = labelBtn;

        const btnConfirmer = document.getElementById('modal-confirmer');
        btnConfirmer.className = mode === 'abandon'
            ? 'btn btn--danger'
            : 'btn btn--primary';

        const saisonSelect = document.getElementById('modal-saison-select');
        saisonSelect.innerHTML = saisons.map(s =>
            `<option value="${s.id}" data-numero="${s.numero_saison}">
                Saison ${s.numero_saison} (${s.nombre_episodes} épisodes)
            </option>`
        ).join('');

        document.getElementById('modal-overlay').classList.add('is-visible');
        document.getElementById('modal-abandon').classList.add('is-visible');

    } catch (err) {
        console.error("[MODAL] Erreur chargement saisons:", err);
        showToast("Impossible de charger les saisons. Veuillez réessayer.");
        if (selectElement) selectElement.value = '';
    }
}

/**
 * Ferme le modal générique. Par défaut, réinitialise le select d'origine (cas annulation).
 * @param {boolean} [annule=true]
 */
export function fermerModal(annule = true) {
    document.getElementById('modal-overlay').classList.remove('is-visible');
    document.getElementById('modal-abandon').classList.remove('is-visible');

    if (annule && _modalContext?.selectElement) {
        _modalContext.selectElement.value = '';
    }
    _modalContext = null;
}

/**
 * Gère le clic sur le bouton de confirmation du modal.
 */
export async function onConfirmerModal() {
    if (!_modalContext) return;

    const { serieId, mode, finalStatut, selectElement, labelBtn } = _modalContext;
    const saisonSelect   = document.getElementById('modal-saison-select');
    const selectedOption = saisonSelect.options[saisonSelect.selectedIndex];
    const numeroSaison   = parseInt(selectedOption.dataset.numero);

    const btnConfirmer = document.getElementById('modal-confirmer');
    btnConfirmer.disabled = true;
    btnConfirmer.textContent = 'Enregistrement…';

    let result;
    if (mode === 'abandon') {
        result = await abandonnerSerie(serieId, numeroSaison, getCurrentUserId());
    } else {
        result = await demarrerSerie(serieId, numeroSaison, getCurrentUserId());
    }

    btnConfirmer.disabled = false;
    btnConfirmer.textContent = labelBtn;

    if (result.success) {
        if (selectElement) selectElement.value = finalStatut;
        fermerModal(false);
        await fetchSeries();
    } else {
        showToast("Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    }
}

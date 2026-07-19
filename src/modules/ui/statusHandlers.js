import { updateStatutUneSaison, updateStatutGlobal, aDejaUnSuiviSaisons, fetchSeries, MOCK_USER_ID } from '../series.js';
import { showToast } from './toast.js';
import { ouvrirModal } from './modal.js';

/**
 * Gère le changement de statut d'une saison spécifique dans l'accordéon.
 */
export async function onSaisonStatutChange(event) {
    const select = event.target;
    const saisonId = parseInt(select.dataset.saisonId);
    const statut = select.value;

    select.disabled = true;
    try {
        const result = await updateStatutUneSaison(saisonId, statut, MOCK_USER_ID);
        if (!result.success) {
            showToast("Erreur lors de la mise à jour de la saison.");
        }
    } finally {
        select.disabled = false;
    }
}

/**
 * Dispatcher central des changements de statut.
 * Chaque statut a sa propre branche logique.
 */
export async function onStatutChange(event) {
    const select = event.target;

    const serieId    = parseInt(select.dataset.serieId);
    const serieTitre = select.dataset.serieTitre;
    const statut     = select.value;

    select.disabled = true;

    try {
        switch (statut) {

            case 'Abandonnée':
                await handleAbandonnee(serieId, serieTitre, select);
                break;

            case 'En cours':
                await handleEnCours(serieId, serieTitre, select);
                break;

            default:
                await handleStatutSimple(serieId, statut, select);
                break;
        }
    } finally {
        select.disabled = false;
    }
}

async function handleStatutSimple(serieId, statut, selectElement) {
    const result = await updateStatutGlobal(serieId, statut, MOCK_USER_ID);
    if (result.success) {
        await fetchSeries();
    } else {
        showToast("Une erreur est survenue lors de l'enregistrement. Voir la console pour les détails.");
        selectElement.value = '';
    }
}

async function handleAbandonnee(serieId, serieTitre, selectElement) {
    await ouvrirModal({
        serieId,
        serieTitre,
        selectElement,
        mode: 'abandon',
        titre:       'Abandonner une série',
        description: `À quelle saison vous êtes-vous arrêté pour`,
        labelBtn:    "Confirmer l'abandon",
        finalStatut: 'Abandonnée',
    });
}

async function handleEnCours(serieId, serieTitre, selectElement) {
    const dejaUnSuivi = await aDejaUnSuiviSaisons(serieId, MOCK_USER_ID);

    if (dejaUnSuivi) {
        console.log(`[UI] Reprise de la série ${serieId} — statuts de saisons préservés.`);
        const result = await updateStatutGlobal(serieId, 'En cours', MOCK_USER_ID);
        if (result.success) {
            await fetchSeries();
        } else {
            showToast("Une erreur est survenue lors de l'enregistrement.");
            if (selectElement) selectElement.value = '';
        }
    } else {
        await ouvrirModal({
            serieId,
            serieTitre,
            selectElement,
            mode: 'demarrage',
            titre:       'Commencer une série',
            description: `À quelle saison commencez-vous`,
            labelBtn:    'Commencer',
            finalStatut: 'En cours',
        });
    }
}

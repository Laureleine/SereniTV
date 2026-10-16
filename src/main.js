import { initUI } from './modules/ui.js';
import { fetchSeries, verifierRenouvellementSaisons } from './modules/series.js';
import { initAuth } from './modules/ui/auth.js';
import { initChangelogModal } from './modules/ui/changelog.js';
import { afficherPopupNouvellesSaisons } from './modules/ui/renouvellement.js';
import { afficherNouveautesSiBesoin } from './modules/ui/monCompte.js';
import { getSavedMode } from './modules/ui/deviceMode.js';

// Enregistrement du Service Worker
const SERVICE_WORKER_URL = new URL('/service-worker.js', location.origin).href;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        // Nettoyage : supprime tout Service Worker orphelin (ex: résidu d'un
        // ancien outil PWA jamais désactivé côté navigateur) qui ne serait
        // pas le nôtre, pour éviter qu'il continue à servir du code/cache périmé.
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
                const scriptURL = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL;
                if (scriptURL && scriptURL !== SERVICE_WORKER_URL) {
                    console.warn('[PWA] Désenregistrement d\'un Service Worker inattendu :', scriptURL);
                    await reg.unregister();
                }
            }
        } catch (err) {
            console.error('[PWA] Erreur lors du nettoyage des Service Workers :', err);
        }

        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('[PWA] Service Worker enregistré avec succès !', reg.scope))
            .catch(err => console.error('[PWA] Échec d\'enregistrement du Service Worker :', err));
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // Indépendant de l'état de connexion : le lien "Changelog" de la landing
    // page publique doit fonctionner avant toute authentification.
    initChangelogModal();

    await initAuth(async () => {
        // Initialiser l'interface utilisateur
        initUI();

        // Charger les données
        try {
            await fetchSeries();
        } catch (e) {
            console.error("Erreur lors du chargement initial:", e);
        }

        // Revérification des séries "Suivies"/"Terminée" en tâche de fond
        // (ne bloque pas l'affichage initial). La fenêtre « Quoi de neuf » ne
        // s'affiche que s'il n'y a pas déjà la popup des nouvelles saisons
        // (sinon elle attend la prochaine ouverture), et jamais en mode télé
        // (affichage passif, personne pour la fermer).
        verifierRenouvellementSaisons()
            .then(nouvellesSaisons => {
                if (nouvellesSaisons?.length) {
                    afficherPopupNouvellesSaisons(nouvellesSaisons);
                } else if (getSavedMode() === 'pc' || getSavedMode() === 'remote') {
                    return afficherNouveautesSiBesoin();
                }
            })
            .catch(e => console.error("Erreur lors de la vérification de renouvellement:", e));
    });
});

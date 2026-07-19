import { initUI } from './modules/ui.js';
import { fetchSeries, verifierRenouvellementSaisons } from './modules/series.js';

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
    // Initialiser l'interface utilisateur
    initUI();
    
    // Charger les données
    try {
        await fetchSeries();
    } catch (e) {
        console.error("Erreur lors du chargement initial:", e);
    }

    // Revérification des séries "Suivies"/"Terminée" en tâche de fond
    // (ne bloque pas l'affichage initial)
    verifierRenouvellementSaisons().catch(e =>
        console.error("Erreur lors de la vérification de renouvellement:", e)
    );
});

import { initUI } from './modules/ui.js';
import { fetchSeries } from './modules/series.js';

// Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
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
});

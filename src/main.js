import { initUI } from './modules/ui.js';
import { fetchSeries } from './modules/series.js';

// Init PWA service worker (géré par vite-plugin-pwa)
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    console.log("Nouvelle version disponible !");
  },
  onOfflineReady() {
    console.log("Application prête à fonctionner hors ligne.");
  },
});

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

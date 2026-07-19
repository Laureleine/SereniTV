const CACHE_NAME = 'serenitv-cache-v3';
// Uniquement des chemins stables, identiques en dev et en production.
// Les fichiers JS/CSS sont exclus : Vite les bundle sous des noms hashés
// différents à chaque build (dist/assets/index-HASH.js), donc lister leurs
// chemins source (/src/...) ici faisait échouer cache.addAll() en production
// (404 sur ces chemins) et empêchait le Service Worker de s'installer.
// Ils sont mis en cache dynamiquement par le handler "fetch" ci-dessous.
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install: Cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache...');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network-First (with cache fallback) to ensure users always get the latest build when online
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests, Supabase database, and TMDB API calls
  if (
    event.request.method !== 'GET' || 
    event.request.url.includes('supabase.co') || 
    event.request.url.includes('api.themoviedb.org')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone response to put it in cache
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if offline
        return caches.match(event.request);
      })
  );
});

const CACHE_NAME = 'serenitv-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/src/main.js',
  '/src/supabase.js',
  '/src/modules/ui.js',
  '/src/modules/series.js',
  '/src/styles/main.css',
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

// Fetch: Network falling back to Cache strategy
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
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        return response;
      }).catch((err) => {
        console.error('[Service Worker] Fetch failed:', err);
      });
    })
  );
});

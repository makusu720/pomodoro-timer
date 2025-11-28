const CACHE_NAME = 'pomodoro-v2-offline';
const ASSETS = [
  '/',
  '/static/style.css',
  '/static/script.js',
  '/static/manifest.json'
];

// 1. Install Service Worker & Cache Assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // Activate immediately
});

// 2. Serve Cached Content when Offline
self.addEventListener('fetch', (e) => {
  // Only cache GET requests (not POST API calls)
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request).catch(() => {
        // Optional: Return a specific "offline.html" if you had one
        // For now, the cached index.html works fine.
      });
    })
  );
});

// 3. Clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

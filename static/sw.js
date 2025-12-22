const CACHE_NAME = 'tb-tracker-v2';
const ASSETS = [
  '/',
  '/static/style.css',
  '/static/script.js',
  '/static/manifest.json',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/index.global.min.css',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/index.global.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install Event: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Network First, Fallback to Cache
// For API calls (like /events, /add_patient), we want fresh data usually.
// But for static files, cache is fine.
self.addEventListener('fetch', (event) => {
  // Identify if it's an API call or static asset
  const isApi = event.request.url.includes('/events') || 
                event.request.url.includes('/add_patient') || 
                event.request.url.includes('/delete_patient') ||
                event.request.url.includes('/update_event') ||
                event.request.url.includes('/api/');

  if (isApi) {
    // API: Network only (for now, until we add IndexDB sync)
    // If offline, this will fail, which is expected for V1.
    event.respondWith(fetch(event.request));
  } else {
    // Static: Stale-While-Revalidate or Cache First
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
    );
  }
});

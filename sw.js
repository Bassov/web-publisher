const CACHE_NAME = 'collage-pwa-v2';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './src/app.js',
    './manifest.json',
    // Core Editor
    './src/editor/App.js',
    './src/editor/Workspace.js',
    './src/editor/PageManager.js',
    './src/editor/Frame.js',
    // UI
    './src/ui/PropertiesPanel.js',
    './src/ui/MediaLibrary.js',
    // Utils
    './src/utils/Exporter.js',
    './src/utils/SnapHelper.js',
    './src/utils/HistoryManager.js',
    // Workers
    './src/workers/thumbnail.worker.js'
];

// Install: Cache core assets immediately
self.addEventListener('install', (e) => {
    // Force this SW to become the active one, bypassing the waiting state
    self.skipWaiting();

    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching all: app shell and content');
            return cache.addAll(ASSETS);
        })
    );
});

// Activate: Clean up old caches and take control
self.addEventListener('activate', (e) => {
    e.waitUntil(
        Promise.all([
            // Take control of all clients immediately (no need to reload)
            self.clients.claim(),
            // Clear old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cache) => {
                        if (cache !== CACHE_NAME) {
                            console.log('[Service Worker] Clearing old cache');
                            return caches.delete(cache);
                        }
                    })
                );
            })
        ])
    );
});

// Fetch: Network First, falling back to Cache
self.addEventListener('fetch', (e) => {
    // Skip cross-origin requests (like user images from other domains, if any)
    if (!e.request.url.startsWith(self.location.origin)) return;

    // For API requests or non-GET methods, just fetch
    if (e.request.method !== 'GET') return;

    e.respondWith(
        fetch(e.request)
            .then((response) => {
                // If we got a valid response, clone it and update the cache
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(e.request, responseToCache);
                    });

                return response;
            })
            .catch(() => {
                // If network fails, try to serve from cache
                console.log('[Service Worker] Network failed, serving offline cache');
                return caches.match(e.request);
            })
    );
});

/* Offline-first app shell. No analytics, push notifications, background sync, or remote APIs. */
const CACHE_NAME = 'doodle-pad-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './brushes.js',
  './manifest.webmanifest',
  './icons/favicon.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];
const SHELL_URLS = SHELL_FILES.map(file => new URL(file, self.location).href);
const INDEX_URL = new URL('./index.html', self.location).href;

/**
 * Download every shell file and store them only if all of them succeed, so the cache never
 * holds a mix of old and new files. `cacheMode` controls the browser's HTTP cache:
 * 'reload' always downloads; 'no-cache' revalidates (cheap when nothing changed).
 */
async function fetchShell(cacheMode) {
  const responses = await Promise.all(SHELL_URLS.map(url => fetch(new Request(url, { cache: cacheMode }))));
  const failed = responses.findIndex(response => !response.ok);
  if (failed !== -1) throw new Error(`Could not download ${SHELL_URLS[failed]}`);
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(SHELL_URLS.map((url, i) => cache.put(url, responses[i])));
}

self.addEventListener('install', event => {
  event.waitUntil(fetchShell('reload').then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Sent by a page that loaded from this cache. Picks up a new version of the app (if any)
// for the next launch, without requiring CACHE_NAME to be changed.
self.addEventListener('message', event => {
  if (event.data === 'refresh-shell') event.waitUntil(fetchShell('no-cache').catch(() => { /* offline */ }));
});

async function respond(event) {
  const cached = await caches.match(event.request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    // Not in the offline cache (for example, a file missing from SHELL_FILES): use the network and keep a copy.
    const response = await fetch(event.request);
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
    }
    return response;
  } catch (_) {
    // Offline: deep navigations (if any) still display the app shell.
    if (event.request.mode === 'navigate') return (await caches.match(INDEX_URL)) || Response.error();
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never intercept, request, or cache anything from third-party origins.
  if (url.origin !== self.location.origin) return;
  event.respondWith(respond(event));
});

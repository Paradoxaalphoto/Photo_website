/* YorN Service Worker – simple precache + runtime cache
   Scope: same folder as index.html
*/
const SW_VERSION = 'yorn-sw-v1';
const APP_SHELL = [
  './',          // ensure scope root
  './index.html' // your single-file app
];

// Matchers for runtime caching (weights, libs, sample image)
const RUNTIME_ALLOWLIST = [
  /\/face-api\.js@[^/]+\/(dist|weights)\//i,
  /\/vladmandic\/face-api\/model/i,
  /@tensorflow\/tfjs/i,
  /@tensorflow-models\/blazeface/i,
  /images\.unsplash\.com\/photo-1502685104226/i
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SW_VERSION);
    await cache.addAll(APP_SHELL.map(u => new Request(u, { cache: 'reload' })));
    // Activate immediately on first load
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(n => n !== SW_VERSION ? caches.delete(n) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  // Only cache GETs
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Same-origin shell: try cache first, then network (offline-friendly)
  const isShell = (url.origin === self.location.origin) &&
                  (url.pathname === '/' || url.pathname.endsWith('/index.html'));

  // Runtime allowlist (CDNs for weights/libs, sample image)
  const shouldRuntimeCache = RUNTIME_ALLOWLIST.some(rx => rx.test(event.request.url));

  if (isShell || shouldRuntimeCache) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
  // else default network (let browser handle)
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SW_VERSION);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then(response => {
    // Cache successful (200) or opaque responses
    const cacheable = response && (response.status === 200 || response.type === 'opaque');
    if (cacheable) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => cached); // if network fails, fall back to cache
  return cached || networkPromise;
}

/* Messages from the page:
   - {type:'yorn:clear'}             -> clears all caches
   - {type:'yorn:precache', urls:[]} -> fetch+cache list of URLs
*/
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'yorn:clear') {
    event.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    })());
  } else if (data.type === 'yorn:precache' && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(SW_VERSION);
      await Promise.all(data.urls.map(async (u) => {
        try {
          const res = await fetch(u, { cache: 'reload' });
          if (res.ok || res.type === 'opaque') await cache.put(u, res.clone());
        } catch (_e) { /* ignore */ }
      }));
    })());
  }
});
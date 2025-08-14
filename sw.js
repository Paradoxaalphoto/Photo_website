// sw.js — YorN service worker
const CACHE = 'yorn-weights-v1';
let cacheFirst = false;

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Utility to add many URLs
async function addAllToCache(urls) {
  const c = await caches.open(CACHE);
  await c.addAll(urls);
}

self.addEventListener('message', async (e) => {
  const data = e.data || {};
  try {
    if (data.type === 'PRECACHE' && Array.isArray(data.urls)) {
      await addAllToCache(data.urls);
      e.source?.postMessage({ type: 'PRECACHE_OK', count: data.urls.length });
    }
    if (data.type === 'MODE') {
      cacheFirst = (data.mode === 'cache-first');
      e.source?.postMessage({ type: 'MODE_SET', mode: cacheFirst ? 'cache-first' : 'network-first' });
    }
  } catch (err) {
    e.source?.postMessage({ type: 'PRECACHE_ERR', msg: String(err) });
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Intercept only likely model assets
  const url = new URL(req.url);
  const isModel =
    /face-api|\/weights\/|tfjs-backend-wasm|\/wasm\//i.test(url.href);

  if (!isModel) return;

  if (cacheFirst) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const resp = await fetch(req);
      if (resp.ok) c.put(req, resp.clone());
      return resp;
    })());
  } else {
    // network-first fallback to cache
    e.respondWith((async () => {
      try {
        const resp = await fetch(req);
        if (resp.ok) {
          const c = await caches.open(CACHE);
          c.put(req, resp.clone());
        }
        return resp;
      } catch {
        const c = await caches.open(CACHE);
        const hit = await c.match(req);
        if (hit) return hit;
        throw new Error('Network failed and no cache');
      }
    })());
  }
});
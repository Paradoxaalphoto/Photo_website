const CACHE = "yorn-v1";
const ASSETS = [
  "/Photo_website/",
  "/Photo_website/index.html",
  "/Photo_website/app.jsx",
  "/Photo_website/manifest.webmanifest"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  // Ignore non-GET
  if (request.method !== "GET") return;
  // cache-first for app shell
  if (ASSETS.some(p => request.url.includes(p))) {
    e.respondWith(caches.match(request).then(res => res || fetch(request)));
    return;
  }
  // network-first for everything else
  e.respondWith(
    fetch(request).then(res => {
      const resClone = res.clone();
      caches.open(CACHE).then(cache => cache.put(request, resClone)).catch(()=>{});
      return res;
    }).catch(() => caches.match(request))
  );
});
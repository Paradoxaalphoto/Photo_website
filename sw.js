const CACHE = "yorn-v1";
const ASSETS = [
  "/Photo_website/",
  "/Photo_website/index.html",
  "/Photo_website/app.jsx"
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
  const req = e.request;
  // cache-first for our app shell, network-first otherwise
  if (ASSETS.some(p => req.url.includes(p))) {
    e.respondWith(caches.match(req).then(res => res || fetch(req)));
  }
});
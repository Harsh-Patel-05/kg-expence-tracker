/* KDS service worker — cache shell for offline board */
const CACHE = "kg-kds-20261119fast1";
const ASSETS = [
  "./kds.html",
  "./css/kds.css?v=20261119fast1",
  "./js/config.js",
  "./js/kds/i18n.js?v=20261119fast1",
  "./js/kds/audio.js?v=20261119fast1",
  "./js/kds/offline.js?v=20261119fast1",
  "./js/kds/kdsStore.js?v=20261119fast1",
  "./js/kds/board.js?v=20261119fast1",
  "./js/kds/app.js?v=20261119fast1",
  "./kds-manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS).catch(() => cache.addAll(["./kds.html"])))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isShell =
    url.pathname.endsWith("kds.html") ||
    url.pathname.endsWith("kds-manifest.json") ||
    url.pathname.endsWith("/kds.css") ||
    url.pathname.includes("/js/kds/") ||
    url.pathname.endsWith("kds-sw.js");
  if (isShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok && req.url.startsWith(self.location.origin)) {
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});

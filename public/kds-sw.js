/* Self-removing stub — never cache or break /pos. */
self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_) {}
      try {
        await self.registration.unregister();
      } catch (_) {}
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) {
        try {
          c.postMessage({ type: "KG_SW_PURGED" });
        } catch (_) {}
      }
    })()
  );
});
/* Do NOT intercept fetch — let the network handle everything. */

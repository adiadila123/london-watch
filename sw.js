/* ==========================================================
   London Community Watch - service worker
   Strategy: network-first with cache fallback for the app shell.
   - You always get the newest code when online.
   - The shell still opens from cache when offline.
   - Supabase and map-tile requests are NEVER cached (live data).
   Bump the CACHE version whenever you deploy breaking changes.
   ========================================================== */

const CACHE = "lcw-v1";

const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GETs (the shell). Everything else -
  // Supabase API, storage photos, OSM tiles, CDNs - goes straight
  // to the network so data is always live.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Keep the cache fresh for offline use.
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

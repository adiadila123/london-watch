/* ==========================================================
   London Community Watch - service worker
   Strategy: network-first with cache fallback for the app shell.
   - You always get the newest code when online.
   - The shell still opens from cache when offline.
   - /api/ and map-tile requests are NEVER cached (live data).
   Bump the CACHE version whenever you deploy breaking changes.
   ========================================================== */

const CACHE = "lcw-v9";

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

  // Only handle same-origin GETs (the shell). Everything else - the
  // /api/ JSON endpoints, OSM tiles, CDNs - goes straight to the
  // network so data is always live. /api/ is same-origin now that
  // Flask serves both the frontend and the API, so it needs its own
  // exclusion (it used to be excluded for free by being cross-origin
  // Supabase calls).
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

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

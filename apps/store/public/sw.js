/*
 * Axiom Tech PWA service worker.
 *
 * Strategy:
 *  - App shell (/): network-first, cached copy shown when offline.
 *  - Build assets (_next/static) and fonts: cache-first (immutable content).
 *  - POS catalog API: network-first with cache fallback so the till keeps a
 *    sellable list when the connection drops.
 *  - Other same-origin GETs: network-first with cache fallback.
 *  - Writes (POST/PUT/PATCH/DELETE): always network — a sale must never be
 *    silently queued without the seller knowing (offline sale queueing is a
 *    planned follow-up behind an explicit UI state).
 */
const VERSION = "axiom-shell-v1";
const SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll([SHELL])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never touch cross-origin API traffic; cache font files from Google.
  const isFontOrigin = url.origin === "https://fonts.gstatic.com" || url.origin === "https://fonts.googleapis.com";
  if (url.origin !== self.location.origin && !isFontOrigin) return;

  const isStatic =
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname === "/manifest.webmanifest" || url.pathname === "/axiom-mark.svg");

  if (isStatic || isFontOrigin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  const isCatalog = url.origin === self.location.origin && url.pathname === "/api/pos/catalog";
  const isNavigate = req.mode === "navigate";

  if (isCatalog || isNavigate || url.origin === self.location.origin) {
    // Network-first with cache fallback.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && (isCatalog || isNavigate)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => {
            if (hit) return hit;
            if (isNavigate) return caches.match(SHELL);
            return new Response(JSON.stringify({ error: "Offline" }), {
              status: 503,
              headers: { "content-type": "application/json" },
            });
          }),
        ),
    );
  }
});

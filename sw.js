/* Cicogna — service worker
   Cache-first per la app shell, network-first con fallback per il resto. */
const CACHE = "cicogna-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // NON intercettare Firebase/Firestore: sempre rete diretta, mai cache
  // (altrimenti la cache-first romperebbe la sincronizzazione in tempo reale).
  if (/firestore\.googleapis\.com|firebaseinstallations\.googleapis\.com|firebase\.googleapis\.com|firebaseremoteconfig\.googleapis\.com|gstatic\.com\/firebasejs/.test(req.url)) {
    return;
  }

  // Navigazioni: rete, fallback alla index in cache (offline)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Altro: cache-first, poi rete (e salva in cache i font Google ecc.)
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit);
    })
  );
});

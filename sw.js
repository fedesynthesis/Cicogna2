/* Nido — service worker */
const CACHE = 'nido-c2-v12';
const ASSETS = ["./","./index.html","./manifest.json","./icon.svg","./icon-180.png","./icon-192.png","./icon-512.png"];
self.addEventListener("install", e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener("activate", e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener("fetch", e=>{
  const req=e.request;
  if(req.method!=="GET") return;
  if(/firestore\.googleapis\.com|firebase|gstatic\.com\/firebasejs/.test(req.url)) return;   // sync sempre dalla rete
  try{ if(new URL(req.url).pathname.startsWith("/hub/")) return; }catch(_){}
  if(req.mode==="navigate"){
    e.respondWith(
      fetch(new Request(req.url,{cache:"no-store",credentials:"same-origin"}))
        .catch(()=>fetch(req)).catch(()=>caches.match("./index.html"))
    );
    return;
  }
  e.respondWith(caches.match(req).then(hit=> hit || fetch(req).then(res=>{
    const copy=res.clone(); caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{}); return res;
  }).catch(()=>hit)));
});

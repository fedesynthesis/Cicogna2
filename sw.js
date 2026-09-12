/* Nido — service worker */
const CACHE = 'nido-c2-v34';
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


/* ---- Notifiche push (FCM manda un webpush; qui la mostro anche ad app chiusa) ---- */
self.addEventListener("push", e=>{
  let d={};
  try{ d = e.data ? e.data.json() : {}; }catch(_){ try{ d={notification:{body:e.data.text()}}; }catch(__){ d={}; } }
  const n = d.notification || (d.data||{});
  const title = n.title || "Nido";
  const body  = n.body  || "Promemoria";
  const opts = {
    body,
    icon:"./icon-192.png",
    badge:"./icon-192.png",
    tag: n.tag || undefined,
    data: { link: (d.fcmOptions&&d.fcmOptions.link) || n.click_action || "/Cicogna2/" },
    vibrate:[80,40,80]
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener("notificationclick", e=>{
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || "/Cicogna2/";
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(ws=>{
    for(const w of ws){ if("focus" in w){ try{ w.navigate && w.navigate(link); }catch(_){}; return w.focus(); } }
    if(clients.openWindow) return clients.openWindow(link);
  }));
});

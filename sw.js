
const CACHE="acervo-v0.3.1";
const CORE=["./","./index.html","./style.css","./app.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const u=new URL(event.request.url);
 if(event.request.mode==="navigate"||u.pathname.endsWith("/app.js")||u.pathname.endsWith("/style.css")||u.pathname.endsWith("/manifest.webmanifest")){
   event.respondWith(fetch(event.request,{cache:"no-store"}).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return resp}).catch(()=>caches.match(event.request).then(r=>r||caches.match("./index.html"))));
 }else{
   event.respondWith(caches.match(event.request).then(r=>r||fetch(event.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return resp})));
 }
});

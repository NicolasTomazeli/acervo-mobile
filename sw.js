const CACHE='acervo-v0.7.4';
const ASSETS=['./','./index.html','./style.css','./app.js','./matcher.js','./foreground.js','./focus-crop.js','./visual-client.js','./matcher-worker.js','./manifest.webmanifest','./icons/icon-192.png'];
const assetURLs=new Set(ASSETS.map(p=>new URL(p,self.registration.scope).href));
// A nova versão só assume depois de fechar as abas antigas, evitando misturar motores.
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('acervo-v')&&key!==CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const u=new URL(event.request.url);u.search='';
 if(u.origin!==self.location.origin||!u.href.startsWith(self.registration.scope))return;
 if(!assetURLs.has(u.href)&&event.request.mode!=='navigate')return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const key=event.request.mode==='navigate'?new URL('./index.html',self.registration.scope).href:u.href;
  const cached=await cache.match(key);if(cached)return cached;
  // Nunca devolve HTML no lugar de JavaScript ou CSS.
  return fetch(event.request);
 })());
});

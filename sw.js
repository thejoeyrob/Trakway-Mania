const CACHE='trakway-ground-shift-v1.0.0';
const ASSETS=['./','./index.html','./styles.css','./game.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./README_FIRST.txt','./VERSION.txt'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin)return;e.respondWith(caches.match(r,{ignoreSearch:true}).then(cached=>cached||fetch(r).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));return res}).catch(()=>caches.match('./index.html'))))});

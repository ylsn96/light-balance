const prefix = `light-balance:${new URL(self.registration.scope).pathname}:`;
const cacheName = `${prefix}v1`;
const assets = ['./', './index.html', './app.js', './core.js', './style.css', './icon.svg', './icon-192.png', './icon-512.png', './manifest.webmanifest', './data/foods.json', './data/sources.json'];
const urls = new Set(assets.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !urls.has(event.request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(event.request)) ?? fetch(event.request);
  })());
});

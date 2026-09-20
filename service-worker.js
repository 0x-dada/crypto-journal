const CACHE_NAME = 'cryptojournal-v5';
const ASSETS = ['/','/index.html','/manifest.json','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/favicon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))); });
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/css/style.css') || e.request.url.includes('/js/')) {
    e.respondWith(fetch(e.request).then(resp => { const clone = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(e.request, clone)); return resp; }).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => { const clone = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(e.request, clone)); return resp; })).catch(() => caches.match('/')));
  }
});
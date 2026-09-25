const CACHE = 'sdr-control-v1';
const SHELL = [
  './', './index.html', './style.css', './script.js', './manifest.json',
  './assets/logo.png', './assets/logo-dark.png', './assets/logo-data.js',
  './assets/vendor/jspdf.umd.min.js', './assets/vendor/jspdf.plugin.autotable.min.js',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match('./index.html'))));
});

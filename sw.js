/* SDR Control — service worker
   Sempre busca a versão mais nova no servidor (GitHub) e usa a cópia salva
   só quando estiver sem internet. O banco de dados (Apps Script) nunca é
   guardado aqui: os dados sempre vêm do servidor. */
const CACHE = 'sdr-control-v2';
const SHELL = [
  './', './index.html', './style.css', './script.js', './config.js', './manifest.json',
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
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // fontes, ViaCEP e Apps Script vão direto para a internet
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

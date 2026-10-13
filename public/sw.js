// Service worker: deixa o app instalável no celular e abre a "casca" mesmo com sinal ruim.
// Dados da obra sempre vêm da rede (nada de informação velha); só os arquivos da interface ficam em cache.
const CACHE = 'mota-casca-v1';
const CASCA = ['/', '/style.css', '/app.js', '/obras.js', '/gestao.js', '/campo.js', '/extras.js', '/favicon.svg', '/manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return; // API: sempre rede
  e.respondWith(fetch(e.request).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});

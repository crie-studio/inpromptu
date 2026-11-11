// Service worker da versão web: guarda o app para abrir sem internet e entrega os modelos de voz
// já baixados (Cache Storage "inpromptu-modelos", preenchido pelo editor).
const VERSION = '__VERSION__';
const SHELL = `inpromptu-web-${VERSION}`; // (inpromptu-app-* era o app antigo, na raiz do site)
const MODELS = 'inpromptu-modelos';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('inpromptu-web-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/models/')) {
    e.respondWith(caches.open(MODELS).then((c) => c.match(url.href)).then((hit) => hit || fetch(req)));
    return;
  }
  if (req.mode === 'navigate') {
    // Páginas: rede primeiro (pega a versão nova), cópia guardada sem internet.
    e.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});

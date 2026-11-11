// O app web morava na raiz do site e foi para /app/. Este arquivo substitui o service worker antigo
// da raiz: apaga a cópia guardada do app antigo (os modelos de voz baixados ficam) e se desliga.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('inpromptu-app-')).map((k) => caches.delete(k)));
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});

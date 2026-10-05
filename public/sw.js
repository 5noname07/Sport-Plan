// Only cache an offline message; never cache authentication or personal database responses.
const CACHE = 'sport-plan-offline-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/offline.html')));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('sport-plan-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
  );
});
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate')
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});

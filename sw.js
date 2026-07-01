// Service worker de Hic Sunt Dracones
// Cachea el "app shell" para que la web abra al instante y funcione offline.
// Sube el número de versión al cambiar estos archivos para forzar refresco.
const CACHE = 'dracones-v17';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/og.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // La API de Supabase siempre va a la red: queremos datos frescos.
  if (url.hostname.endsWith('supabase.co')) return;

  // Navegaciones (incluye deep-links ?id=N): servimos siempre el shell cacheado
  // —el id lo resuelve el JS de la página—, así no se acumula una entrada de
  // caché por cada enlace compartido. El shell se refresca al subir CACHE.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) =>
        cached || fetch(req).catch(() => caches.match('/'))
      )
    );
    return;
  }

  // Resto de recursos del app shell (mismo origen): cache-first con refresco.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

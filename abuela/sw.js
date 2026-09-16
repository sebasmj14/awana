/* Service Worker — Cuidado Abue
   - Cachea la app para que abra sin internet.
   - Maneja el clic en las notificaciones.
   - (En la etapa de Web Push se agregará el evento 'push'.)
*/
const CACHE = 'abue-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/config.js',
  './js/db.js',
  './js/store-supabase.js',
  './js/reminders.js',
  './js/app.js',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  // Estrategia RED PRIMERO para nuestros archivos: siempre trae lo último y,
  // si no hay internet, usa lo guardado. Así las actualizaciones entran solas.
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && sameOrigin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});

// Clic en una notificación: enfocar o abrir la app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});

// Preparado para Web Push (se activará al conectar Supabase)
self.addEventListener('push', (e) => {
  let data = { title: '💊 Recordatorio', body: 'Es hora del medicamento' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: 'icons/icon.svg',
    badge: 'icons/icon.svg',
    vibrate: [120, 60, 120],
    tag: data.tag,
    requireInteraction: true,
    data,
  }));
});

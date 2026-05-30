const CACHE = 'felcin-v12';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

// Push notifications
self.addEventListener('push', function(event) {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Felcin', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Felcin', {
      body: data.body || '',
      icon: '/static/logo-nav.svg',
      badge: '/static/logo-nav.svg',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window' }).then(function(list) {
    for (const client of list) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});

// Always fetch HTML and scripts fresh from the network, bypassing iOS disk cache.
self.addEventListener('fetch', function(event) {
  var req = event.request;
  try {
    var url = new URL(req.url);
    if (url.origin !== location.origin) return;
    var path = url.pathname;
    var ext  = path.split('.').pop().toLowerCase();
    var isNav   = req.mode === 'navigate';
    var isHtml  = ext === 'html' || path === '/';
    var isAsset = ext === 'js' || ext === 'css';
    if (isNav || isHtml || isAsset) {
      event.respondWith(
        fetch(req, { cache: 'no-store' }).catch(function() {
          return caches.match(req) || new Response('Offline', { status: 503 });
        })
      );
    }
  } catch(e) {}
});

const CACHE = 'felcin-v11';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

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

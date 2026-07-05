const CACHE = 'felcin-v14';

// Inline offline page shown when nothing is cached yet
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Felcin</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#090909;color:#f2f2f2;font-family:-apple-system,system-ui,sans-serif;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100dvh;padding:32px;text-align:center;
         padding-top:env(safe-area-inset-top,32px)}
    img{width:72px;height:72px;margin-bottom:28px;border-radius:20px;opacity:.9}
    .pill{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);
          color:#f87171;font-size:12px;font-weight:700;padding:6px 14px;
          border-radius:999px;display:inline-flex;align-items:center;gap:6px;margin-bottom:20px}
    h1{font-size:22px;font-weight:800;margin-bottom:10px}
    p{font-size:14px;color:#555;line-height:1.6;max-width:280px}
    button{margin-top:32px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);
           color:#f2f2f2;font-size:14px;font-weight:700;padding:13px 32px;
           border-radius:14px;cursor:pointer;-webkit-tap-highlight-color:transparent}
  </style>
</head>
<body>
  <img src="/logo512.png" alt="Felcin">
  <div class="pill">&#x1F4F6; No internet connection</div>
  <h1>You're offline</h1>
  <p>Check your connection and try again. Your data will sync automatically when you're back online.</p>
  <button onclick="window.location.reload()">Try again</button>
</body>
</html>`;

const OFFLINE_RESPONSE = () => new Response(OFFLINE_HTML, {
  status: 200,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
});

const APP_SHELL = [
  '/',
  '/login',
  '/manifest.json',
  '/logo512.png',
  '/static/logo-nav.svg',
];

// Install — pre-cache the app shell, one URL at a time so one failure doesn't abort all
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const url of APP_SHELL) {
        try { await cache.add(url); } catch {}
      }
    })
  );
  self.skipWaiting();
});

// Activate — remove old cache versions only
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch — smart caching strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  try {
    const url = new URL(req.url);
    if (url.origin !== location.origin) return;

    // Skip API routes and Next.js RSC data (always need fresh data)
    if (url.pathname.startsWith('/api/')) return;
    if (url.pathname.startsWith('/_next/data/')) return;

    // Cache-first for hashed static assets (safe to cache forever)
    if (url.pathname.startsWith('/_next/static/')) {
      event.respondWith(
        caches.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(req, clone));
            }
            return res;
          }).catch(() => OFFLINE_RESPONSE());
        })
      );
      return;
    }

    // Network-first for pages — fall back to cache, then offline screen
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const root = await caches.match('/');
          if (root) return root;
          return OFFLINE_RESPONSE();
        })
    );
  } catch {}
});

// Push notifications
self.addEventListener('push', (event) => {
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

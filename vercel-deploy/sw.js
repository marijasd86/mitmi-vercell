const CACHE_NAME = 'svita-v4';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/robots.txt',
  '/assets/styles/tokens.css',
  '/assets/styles/base.css',
  '/assets/styles/components.css',
  '/assets/styles/pages.css',
  '/assets/scripts/core/runtime.js',
  '/assets/scripts/bootstrap/init.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/slike/logo.png',
  '/slike/logo za tamnu pozadinu.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    event.respondWith(Response.error());
    return;
  }

  event.respondWith((async () => {
    try {
      // Let non-http(s) schemes pass through untouched.
      if (!url.protocol.startsWith('http')) {
        return fetch(req);
      }

      // Third-party and Supabase requests should go straight to network.
      if (url.origin !== self.location.origin || url.hostname.includes('supabase.co')) {
        return await fetch(req);
      }

      if (req.method !== 'GET') {
        return await fetch(req);
      }

      const cached = await caches.match(req);
      if (cached) return cached;

      const response = await fetch(req);
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
      }
      return response;
    } catch (e) {
      if (req.mode === 'navigate') {
        const fallback = await caches.match('/index.html');
        return fallback || Response.error();
      }
      return Response.error();
    }
  })());
});

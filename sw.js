const CACHE_NAME = 'resonate-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './rife_library.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Jost:wght@300;500;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

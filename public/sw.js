const CACHE_NAME = 'leaf-player-v1';
const AUDIO_CACHE = 'leaf-player-audio-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Handle Cloudinary Audio/Images
  if (url.hostname === 'res.cloudinary.com' || url.hostname === 'images.unsplash.com' || url.hostname.includes('mzstatic.com')) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response) {
            // Return cached response
            return response;
          }
          
          // Fetch and cache
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Offline - return nothing if not in cache
            return null;
          });
        });
      })
    );
    return;
  }

  // Handle Range Requests for Audio (Simplified)
  if (event.request.headers.get('range')) {
    // Basic range handling is complex in SW, we'll let the browser handle it if online
    // or serve the whole blob if it's already in cache
  }

  // Default fetch
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

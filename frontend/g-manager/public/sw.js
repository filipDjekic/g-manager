const VERSION = 'g-manager-shell-v24-1'
const SHELL = ['/', '/manifest.webmanifest', '/pwa-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('g-manager-shell-') && key !== VERSION)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'PURGE_PRIVATE') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(
      keys.filter((key) => !key.startsWith('g-manager-shell-')).map((key) => caches.delete(key)),
    )))
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async (response) => {
      const cache = await caches.open(VERSION)
      await cache.put('/', response.clone())
      return response
    }).catch(() => caches.match('/')))
    return
  }
  if (!['script', 'style', 'font', 'image'].includes(request.destination)) return
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(VERSION)
      await cache.put(request, response.clone())
    }
    return response
  })))
})

export function registerPwa(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
    if (registration.waiting) window.dispatchEvent(new Event('gmanager:update-ready'))
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', () => {
        if (registration.waiting && navigator.serviceWorker.controller) window.dispatchEvent(new Event('gmanager:update-ready'))
      })
    })
  }).catch(() => window.dispatchEvent(new Event('gmanager:pwa-error')))
}

export function activateUpdate(): void {
  navigator.serviceWorker.getRegistration().then((registration) => registration?.waiting?.postMessage({ type: 'SKIP_WAITING' }))
}

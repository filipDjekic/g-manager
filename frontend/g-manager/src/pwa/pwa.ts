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

export async function activateUpdate(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.waiting) return
  await new Promise<void>((resolve, reject) => {
    const ready = () => { clearTimeout(timeout); resolve() }
    const timeout = window.setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', ready); reject(new Error('Update activation timed out')) }, 10000)
    navigator.serviceWorker.addEventListener('controllerchange', ready, { once: true })
    registration.waiting!.postMessage({ type: 'SKIP_WAITING' })
  })
}

import { useEffect, useState } from 'react'
import { activateUpdate } from './pwa'

export function ConnectivityBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [update, setUpdate] = useState(false)
  const [staleAt, setStaleAt] = useState<number | null>(null)
  useEffect(() => {
    const connected = () => setOnline(true); const disconnected = () => setOnline(false); const ready = () => setUpdate(true)
    const stale = (event: Event) => setStaleAt((event as CustomEvent<number>).detail)
    window.addEventListener('online', connected); window.addEventListener('offline', disconnected); window.addEventListener('gmanager:update-ready', ready); window.addEventListener('gmanager:stale-read', stale)
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); window.removeEventListener('gmanager:update-ready', ready); window.removeEventListener('gmanager:stale-read', stale) }
  }, [])
  if (update) return <aside className="connectivity-banner" role="status">Nova verzija je spremna. <button onClick={() => { activateUpdate(); window.location.reload() }}>Ažuriraj</button></aside>
  if (!online) return <aside className="connectivity-banner" role="status">Offline režim: prikazani podaci mogu biti zastareli. Slanje izmena nije dostupno.</aside>
  if (staleAt) return <aside className="connectivity-banner" role="status">Server nije dostupan. Prikaz je iz lokalnog read-only cache-a od {new Date(staleAt).toLocaleString()}.</aside>
  return null
}

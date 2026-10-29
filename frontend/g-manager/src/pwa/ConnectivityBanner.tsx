import { useSyncExternalStore } from 'react'
import { subscribeUnsavedWork, unsavedWorkState } from '../forms/useDirtyGuard'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { Button } from '../components/ui'
import { useEffect, useState } from 'react'
import { activateUpdate } from './pwa'

export function ConnectivityBanner() {
  const work = useSyncExternalStore(subscribeUnsavedWork, unsavedWorkState)
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [failure, setFailure] = useState(''), [updating, setUpdating] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [update, setUpdate] = useState(false)
  const [staleAt, setStaleAt] = useState<number | null>(null)
  useEffect(() => {
    const connected = () => setOnline(true); const disconnected = () => setOnline(false); const ready = () => setUpdate(true)
    const stale = (event: Event) => setStaleAt((event as CustomEvent<number>).detail)
    window.addEventListener('online', connected); window.addEventListener('offline', disconnected); window.addEventListener('gmanager:update-ready', ready); window.addEventListener('gmanager:stale-read', stale)
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); window.removeEventListener('gmanager:update-ready', ready); window.removeEventListener('gmanager:stale-read', stale) }
  }, [])
  async function applyUpdate() {
    if (['pending','handoff'].includes(unsavedWorkState()) || updating || !navigator.onLine) return
    setUpdating(true); setFailure('')
    try { await activateUpdate(); window.location.reload() }
    catch { setFailure('Ažuriranje nije preuzeto. Pokušajte ponovo.'); setUpdating(false) }
  }
  function requestUpdate() {
    if (work === 'dirty') confirm({ title:'Ažuriraj i odbaci unose?', description:'Nova verzija ponovo učitava aplikaciju. Nesačuvani unosi biće odbačeni.', variant:'warning', confirmLabel:'Ažuriraj', onConfirm:applyUpdate })
    else void applyUpdate()
  }
  if (online && !staleAt && !update && !failure) return null
  return <aside className="connectivity-banner" role="status">{confirmationDialog}
    {!online && <span>Offline režim: prikazani podaci mogu biti zastareli. Slanje izmena nije dostupno.</span>}
    {online && staleAt && <span>Server nije dostupan. Prikaz je iz lokalnog cache-a, samo za čitanje, od {new Date(staleAt).toLocaleString()}.</span>}
    {update && <span>Nova verzija je spremna. {work === 'pending' && 'Najpre proverite ishod prethodnog zahteva.'}{work === 'handoff' && 'Najpre preuzmite jednokratni kod u otvorenom prozoru.'}
      <Button variant="ghost" disabled={!online || (work === 'pending' || work === 'handoff')} loading={updating} onClick={requestUpdate}>Ažuriraj</Button></span>}
    {failure && <span role="alert">{failure}</span>}
  </aside>
}

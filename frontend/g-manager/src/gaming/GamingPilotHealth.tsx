import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { Alert } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'
export function GamingPilotHealth({ visible }: { visible:boolean }) {
  const [open, setOpen] = useState(false)
  const health = useQuery({ queryKey: ['gaming-pilot-health'], queryFn: gamingSessionApi.health,
    enabled: open && visible, refetchInterval: open && visible ? 30000 : false, refetchIntervalInBackground: false, retry: 1 })
  const label = (value:string) => value === 'UP' ? 'U redu' : value === 'DEGRADED' ? 'Potrebna provera' : 'Nije potvrđeno'
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Dijagnostika sistema</summary>
    {health.isError ? <Alert tone="danger">Stanje servera i baze nije potvrđeno. Proverite vezu i servis.</Alert> : health.data ? <>
      <p>Server: {label(health.data.backend)} · Baza: {label(health.data.database)} · Finansijska evidencija: {label(health.data.financialLedger)}</p>
      {health.data.backup && <p>Backup: {label(health.data.backup)}</p>}
      <p>Provereno: {formatBusinessDateTime(health.data.checkedAt)}{!visible && ' · Provera je pauzirana'}</p>
    </> : <p>{open ? 'Provera je u toku…' : 'Otvorite za proveru.'}</p>}
  </details>
}

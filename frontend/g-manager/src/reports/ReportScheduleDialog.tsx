import { useFormClose } from '../forms/useFormClose'
import { useRef, useState, type FormEvent } from 'react'
import { reportApi } from '../api/reportApi'
import { apiErrorMessage } from '../api/client'
import { Alert, Button, Input, Modal, Select } from '../components/ui'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import type { GenerateReport } from '../types/report.types'
import { formatBusinessDateTime } from '../reservations/dateTime'
import { reportLabels } from './reportPresentation'

export function ReportScheduleDialog({ payload, onClose, onSaved }: { payload: GenerateReport; onClose: () => void; onSaved: () => void }) {
  const [time, setTime] = useState('08:00'), [day, setDay] = useState('1'), [zone, setZone] = useState(payload.timezone)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), lock = useRef(false)
  const dirty = time!=='08:00'||day!=='1'||zone!==payload.timezone
  useDirtyGuard(dirty || busy, { pending: busy })
  const dismiss=useFormClose(dirty,busy,onClose)
  async function save(event: FormEvent) {
    event.preventDefault(); if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await reportApi.createSchedule({ ...payload, timezone: zone, localTime: time, dayOfWeek: day ? Number(day) : null }); onSaved(); onClose() }
    catch (cause) { setError(apiErrorMessage(cause, 'Raspored nije sačuvan.')) }
    finally { lock.current = false; setBusy(false) }
  }
  return <>{dismiss.confirmationDialog}<Modal open title="Zakaži izveštaj" onClose={dismiss.close} closeDisabled={busy}><form className="ui-form-grid" onSubmit={save}>
    <p>{reportLabels[payload.definitionKey]} · {payload.format}</p>
    <p>Fiksni period: {formatBusinessDateTime(payload.from)} - {formatBusinessDateTime(payload.to)} (isključivi kraj). Svako zakazano pokretanje koristi ovaj period.</p>
    <label>Učestalost<Select value={day} disabled={busy} onChange={event => setDay(event.target.value)}><option value="">Svakog dana</option>
      {['Ponedeljak','Utorak','Sreda','Četvrtak','Petak','Subota','Nedelja'].map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</Select></label>
    <label>Lokalno vreme<Input type="time" required value={time} disabled={busy} onChange={event => setTime(event.target.value)} /></label>
    <label>Vremenska zona<Input required value={zone} disabled={busy} onChange={event => setZone(event.target.value)} /></label>
    {error && <Alert tone="danger">{error}</Alert>}
    <Button type="submit" loading={busy}>Sačuvaj raspored</Button>
  </form></Modal></>
}

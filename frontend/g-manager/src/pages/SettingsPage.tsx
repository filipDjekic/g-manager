import { type FormEvent, useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { workingHoursApi } from '../api/workingHoursApi'
import { timeOffApi } from '../api/timeOffApi'
import { userApi } from '../api/userApi'
import { Link, useLocation } from 'react-router-dom'
import { SetupOverview } from '../settings/SetupOverview'
import { Button, Skeleton } from '../components/ui'
import { workingHoursExceptionSchema } from '../workingHours/workingHoursSchema'
import type {
  WorkingHours,
  WorkingHoursException,
  WorkingHoursExceptionInput,
} from '../types/workingHours.types'
import type { TimeOff, TimeOffStatus } from '../types/timeOff.types'
import type { UserResponse } from '../types/user.types'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { formatBusinessDateTime } from '../reservations/dateTime'
import { Tabs } from '../components/ui/Tabs'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'

const dayNames: Record<string, string> = {
  MONDAY: 'Ponedeljak',
  TUESDAY: 'Utorak',
  WEDNESDAY: 'Sreda',
  THURSDAY: 'Četvrtak',
  FRIDAY: 'Petak',
  SATURDAY: 'Subota',
  SUNDAY: 'Nedelja',
}

const emptyException: WorkingHoursExceptionInput = {
  date: '',
  description: '',
  fullDayClosed: true,
}

export function SettingsPage() {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const toast = useToast()
  const actor = useAuthStore((state) => state.user)
  const [saving, setSaving] = useState<string | null>(null)
  const saveInFlight = useRef(false)
  function beginSave(key: string) {
    if (saveInFlight.current) return false
    saveInFlight.current = true; setSaving(key); setError(''); setMessage(''); return true
  }
  function finishSave() { saveInFlight.current = false; setSaving(null) }
  const location = useLocation()
  const [section, setSection] = useState(location.hash === '#working-hours' ? 'hours' : 'overview')
  useEffect(() => { if (location.hash === '#working-hours') setSection('hours') }, [location.hash])
  const [minimumDate] = useState(() =>
    new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const [hours, setHours] = useState<WorkingHours[]>([])
  const [exceptions, setExceptions] = useState<WorkingHoursException[]>([])
  const [employees, setEmployees] = useState<UserResponse[]>([])
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [timeOffForm, setTimeOffForm] = useState({ employeeId: '', startsAt: '', endsAt: '', reason: '' })
  const [exceptionForm, setExceptionForm] =
    useState<WorkingHoursExceptionInput>(emptyException)
  const [editingException, setEditingException] =
    useState<WorkingHoursException | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [setupLoaded,setSetupLoaded]=useState(false)
  const [loadAttempt,setLoadAttempt]=useState(0)
  const [setupLoading,setSetupLoading]=useState(true)

  useEffect(() => {
    void Promise.all([
      workingHoursApi.list(), workingHoursApi.listExceptions(), userApi.employees(), timeOffApi.list(),
    ])
      .then(([weeklyHours, futureExceptions, employeeList, timeOffList]) => {
        setHours(weeklyHours)
        setExceptions(futureExceptions)
        setEmployees(employeeList)
        setTimeOff(timeOffList)
        setSetupLoaded(true)
        setTimeOffForm((current) => ({ ...current, employeeId: current.employeeId || employeeList[0]?.id || '' }))
      })
      .catch((cause) =>
        setError(apiErrorMessage(cause, 'Podešavanja nije moguće učitati.')))
      .finally(()=>setSetupLoading(false))
  }, [loadAttempt])

  function updateLocal(index: number, patch: Partial<WorkingHours>) {
    setHours((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item))
  }

  async function saveDay(index: number) {
    const item = hours[index]
    if (!item) return
    if (item.openTime === item.closeTime) {
      setError('Radno vreme ne može imati nulto trajanje.')
      return
    }
    if (!beginSave(`hours-${index}`)) return
    try {
      const saved = await workingHoursApi.update(item)
      updateLocal(index, saved)
      setError('')
      setMessage(`${dayNames[item.dayOfWeek]} je sačuvan.`)
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Radno vreme nije moguće sačuvati.'))
    } finally { finishSave() }
  }

  async function reloadExceptions() {
    setExceptions(await workingHoursApi.listExceptions())
  }

  function startExceptionEdit(exception: WorkingHoursException) {
    setEditingException(exception)
    setExceptionForm({
      date: exception.date,
      description: exception.description ?? '',
      fullDayClosed: exception.fullDayClosed,
      overrideOpenTime: exception.overrideOpenTime?.slice(0, 5),
      overrideCloseTime: exception.overrideCloseTime?.slice(0, 5),
      version: exception.version,
    })
  }

  function resetException() {
    setEditingException(null)
    setExceptionForm(emptyException)
  }

  async function saveException(event: FormEvent) {
    event.preventDefault()
    const parsed = workingHoursExceptionSchema.safeParse(exceptionForm)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Izuzetak nije validan.')
      return
    }
    const input: WorkingHoursExceptionInput = {
      ...parsed.data,
      overrideOpenTime: parsed.data.fullDayClosed
        ? undefined : parsed.data.overrideOpenTime,
      overrideCloseTime: parsed.data.fullDayClosed
        ? undefined : parsed.data.overrideCloseTime,
      version: editingException?.version,
    }
    if (!beginSave('exception')) return
    try {
      if (editingException) {
        await workingHoursApi.updateException(editingException.id, input)
      } else {
        await workingHoursApi.createException(input)
      }
      await reloadExceptions()
      resetException()
      setError('')
      setMessage('Izuzetak je sačuvan.')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Izuzetak nije moguće sačuvati.'))
    } finally { finishSave() }
  }

  async function removeException(exception: WorkingHoursException) {
    confirm({ title: 'Obriši izuzetak radnog vremena', description: `Za ${exception.date} ponovo će važiti nedeljni raspored.`,
      variant: 'danger', confirmLabel: 'Obriši izuzetak', errorMessage: 'Izuzetak nije moguće obrisati.', onConfirm: async () => {
      await workingHoursApi.deleteException(exception)
      await reloadExceptions()
      toast('Izuzetak je obrisan.', 'success')
    } })
  }

  async function createTimeOff(event: FormEvent) {
    event.preventDefault()
    if (new Date(timeOffForm.endsAt) <= new Date(timeOffForm.startsAt)) {
      setError('Kraj odsustva mora biti posle početka.')
      return
    }
    if (!beginSave('timeoff')) return
    try {
      await timeOffApi.create({
        ...timeOffForm,
        startsAt: new Date(timeOffForm.startsAt).toISOString(),
        endsAt: new Date(timeOffForm.endsAt).toISOString(),
      })
      setTimeOff(await timeOffApi.list())
      setTimeOffForm((current) => ({ employeeId: current.employeeId, startsAt: '', endsAt: '', reason: '' }))
      setError('')
      setMessage('Zahtev za odsustvo je sačuvan.')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Odsustvo nije moguće sačuvati.'))
    } finally { finishSave() }
  }

  async function decideTimeOff(item: TimeOff, status: TimeOffStatus) {
    if (!beginSave(item.id)) return
    try {
      await timeOffApi.decide(item, status)
      setTimeOff(await timeOffApi.list())
      setError('')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Status odsustva nije moguće promeniti.'))
    } finally { finishSave() }
  }

  return (
    <main className="workspace">
      {confirmationDialog}
      <div className="page-heading">
        <div><p className="eyebrow">Upravljanje igraonicom</p><h1>Podešavanja</h1></div>
        <span>Europe/Belgrade</span>
      </div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {!setupLoaded && error && <Button variant="secondary" loading={setupLoading} onClick={()=>{setError('');setSetupLoading(true);setLoadAttempt(value=>value+1)}}>Ponovo učitaj podešavanja</Button>}
      {!setupLoaded && setupLoading && <Skeleton lines={3} label="Učitavanje podešavanja"/>}
      {message && <p className="success-banner" role="status">{message}</p>}
      <Tabs idPrefix="settings" label="Oblasti podešavanja" value={section} onChange={setSection} items={[
        { id: 'overview', label: 'Pregled' }, { id: 'hours', label: 'Radno vreme' },
        { id: 'exceptions', label: 'Izuzeci' }, { id: 'timeoff', label: 'Odsustva' },
      ]} />
      <div role="tabpanel" id="settings-panel-overview" aria-labelledby="settings-tab-overview" hidden={section !== 'overview'}>
      <nav className="settings-links" aria-label="Povezana podešavanja">
        {hasCapability(actor, 'RESOURCE_READ') && <Link to="/resources">Lokacije i resursi</Link>}
        {hasCapability(actor, 'STATION_READ') && <Link to="/stations">Stanice i profili</Link>}
        {hasCapability(actor, 'USER_LIST') && <Link to="/employees">Zaposleni</Link>}
        {hasCapability(actor, 'CATALOG_READ') && <Link to="/catalog">Katalog</Link>}
        {hasCapability(actor, 'PROFILE_READ') && <><Link to="/notification-preferences">Obaveštenja</Link><Link to="/sessions">Bezbednost naloga</Link></>}
      </nav>
      <SetupOverview hours={hours} employees={employees} loaded={setupLoaded}/>
      </div>
      <div role="tabpanel" id="settings-panel-hours" aria-labelledby="settings-tab-hours" hidden={section !== 'hours'}>
      <section id="working-hours" className="panel weekly-hours">
        <h2>Nedeljni raspored</h2>
        {hours.map((item, index) => <div className="hours-row" key={item.dayOfWeek}>
          <strong>{dayNames[item.dayOfWeek]}</strong>
          <label className="inline-toggle"><input disabled={Boolean(saving)} type="checkbox" checked={item.active}
            onChange={(event) => updateLocal(index, { active: event.target.checked })} /> Radi</label>
          <label>Otvaranje<input disabled={Boolean(saving)} type="time" value={item.openTime.slice(0, 5)}
            onChange={(event) => updateLocal(index, { openTime: event.target.value })} /></label>
          <label>Zatvaranje<input disabled={Boolean(saving)} type="time" value={item.closeTime.slice(0, 5)}
            onChange={(event) => updateLocal(index, { closeTime: event.target.value })} /></label>
          <span className="overnight-hint">{item.closeTime < item.openTime ? 'Smena prelazi ponoć' : ''}</span>
          <Button type="button" loading={saving === `hours-${index}`} disabled={Boolean(saving)} onClick={() => void saveDay(index)}>Sačuvaj</Button>
        </div>)}
      </section>
      </div>
      <div role="tabpanel" id="settings-panel-exceptions" aria-labelledby="settings-tab-exceptions" hidden={section !== 'exceptions'}>
      <div className="panel-grid settings-grid">
        <form className="panel" onSubmit={saveException}>
          <h2>{editingException ? 'Izmeni izuzetak' : 'Novi izuzetak'}</h2>
          <label>Datum<input disabled={Boolean(saving)} type="date" required min={minimumDate}
            value={exceptionForm.date} onChange={(event) => setExceptionForm({ ...exceptionForm, date: event.target.value })} /></label>
          <label>Opis<input disabled={Boolean(saving)} maxLength={500} value={exceptionForm.description}
            onChange={(event) => setExceptionForm({ ...exceptionForm, description: event.target.value })} /></label>
          <label className="inline-toggle"><input disabled={Boolean(saving)} type="checkbox" checked={exceptionForm.fullDayClosed}
            onChange={(event) => setExceptionForm({
              ...exceptionForm,
              fullDayClosed: event.target.checked,
              overrideOpenTime: undefined,
              overrideCloseTime: undefined,
            })} /> Ceo dan zatvoreno</label>
          {!exceptionForm.fullDayClosed && <>
            <label>Otvaranje<input disabled={Boolean(saving)} type="time" required value={exceptionForm.overrideOpenTime ?? ''}
              onChange={(event) => setExceptionForm({ ...exceptionForm, overrideOpenTime: event.target.value })} /></label>
            <label>Zatvaranje<input disabled={Boolean(saving)} type="time" required value={exceptionForm.overrideCloseTime ?? ''}
              onChange={(event) => setExceptionForm({ ...exceptionForm, overrideCloseTime: event.target.value })} /></label>
            {exceptionForm.overrideOpenTime && exceptionForm.overrideCloseTime
              && exceptionForm.overrideCloseTime < exceptionForm.overrideOpenTime
              && <span className="overnight-hint">Izuzetak prelazi ponoć</span>}
          </>}
          <div className="form-actions"><Button type="submit" loading={saving === 'exception'} disabled={Boolean(saving)}>Sačuvaj izuzetak</Button>
            {editingException && <Button variant="secondary" type="button" disabled={Boolean(saving)} onClick={resetException}>Odustani</Button>}</div>
        </form>
        <section className="panel">
          <h2>Budući izuzeci</h2>
          {!exceptions.length && <p className="empty-state compact">Nema definisanih izuzetaka.</p>}
          {exceptions.map((exception) => <article className="exception-row" key={exception.id}>
            <div><strong>{exception.date}</strong><p>{exception.description || 'Bez opisa'}</p>
              <small>{exception.fullDayClosed ? 'Ceo dan zatvoreno'
                : `${exception.overrideOpenTime?.slice(0, 5)}–${exception.overrideCloseTime?.slice(0, 5)}`}</small></div>
            <div className="form-actions"><Button variant="secondary" type="button" disabled={Boolean(saving)} onClick={() => startExceptionEdit(exception)}>Izmeni</Button>
              <Button variant="danger" type="button" disabled={Boolean(saving)} onClick={() => void removeException(exception)}>Obriši</Button></div>
          </article>)}
        </section>
      </div>
      </div>
      <div role="tabpanel" id="settings-panel-timeoff" aria-labelledby="settings-tab-timeoff" hidden={section !== 'timeoff'}>
      <div className="panel-grid settings-grid">
        <form className="panel" onSubmit={createTimeOff}>
          <h2>Novo odsustvo zaposlenog</h2>
          <label>Zaposleni<select disabled={Boolean(saving)} required value={timeOffForm.employeeId}
            onChange={(event) => setTimeOffForm({ ...timeOffForm, employeeId: event.target.value })}>
            <option value="" disabled>Izaberite zaposlenog</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select></label>
          <label>Početak<input disabled={Boolean(saving)} type="datetime-local" required value={timeOffForm.startsAt}
            onChange={(event) => setTimeOffForm({ ...timeOffForm, startsAt: event.target.value })} /></label>
          <label>Kraj<input disabled={Boolean(saving)} type="datetime-local" required value={timeOffForm.endsAt}
            onChange={(event) => setTimeOffForm({ ...timeOffForm, endsAt: event.target.value })} /></label>
          <label>Razlog<input disabled={Boolean(saving)} maxLength={500} required value={timeOffForm.reason}
            onChange={(event) => setTimeOffForm({ ...timeOffForm, reason: event.target.value })} /></label>
          <Button type="submit" loading={saving === 'timeoff'} disabled={Boolean(saving)}>Sačuvaj zahtev</Button>
        </form>
        <section className="panel">
          <h2>Odsustva zaposlenih</h2>
          {!timeOff.length && <p className="empty-state compact">Nema zahteva za odsustvo.</p>}
          {timeOff.map((item) => <article className="exception-row" key={item.id}>
            <div><strong>{employees.find((employee) => employee.id === item.employeeId)?.name ?? 'Zaposleni nije dostupan'}</strong>
              <p>{item.reason}</p><small>{formatBusinessDateTime(item.startsAt)} – {formatBusinessDateTime(item.endsAt)} · {{ PENDING: 'Na čekanju', APPROVED: 'Odobreno', REJECTED: 'Odbijeno', CANCELLED: 'Otkazano' }[item.status]}</small></div>
            <div className="form-actions">
              {item.status === 'PENDING' && <><Button type="button" loading={saving === item.id} disabled={Boolean(saving)} onClick={() => void decideTimeOff(item, 'APPROVED')}>Odobri</Button>
                <Button variant="secondary" type="button" disabled={Boolean(saving)} onClick={() => void decideTimeOff(item, 'REJECTED')}>Odbij</Button></>}
              {(item.status === 'PENDING' || item.status === 'APPROVED') &&
                <Button variant="danger" type="button" disabled={Boolean(saving)} onClick={() => void decideTimeOff(item, 'CANCELLED')}>Otkaži</Button>}
            </div>
          </article>)}
        </section>
      </div>
      </div>
    </main>
  )
}

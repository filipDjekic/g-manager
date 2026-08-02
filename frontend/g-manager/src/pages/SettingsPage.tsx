import { type FormEvent, useEffect, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { workingHoursApi } from '../api/workingHoursApi'
import { workingHoursExceptionSchema } from '../workingHours/workingHoursSchema'
import type {
  WorkingHours,
  WorkingHoursException,
  WorkingHoursExceptionInput,
} from '../types/workingHours.types'

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
  const [minimumDate] = useState(() =>
    new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const [hours, setHours] = useState<WorkingHours[]>([])
  const [exceptions, setExceptions] = useState<WorkingHoursException[]>([])
  const [exceptionForm, setExceptionForm] =
    useState<WorkingHoursExceptionInput>(emptyException)
  const [editingException, setEditingException] =
    useState<WorkingHoursException | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void Promise.all([workingHoursApi.list(), workingHoursApi.listExceptions()])
      .then(([weeklyHours, futureExceptions]) => {
        setHours(weeklyHours)
        setExceptions(futureExceptions)
      })
      .catch((cause) =>
        setError(apiErrorMessage(cause, 'Podešavanja nije moguće učitati.')))
  }, [])

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
    try {
      const saved = await workingHoursApi.update(item)
      updateLocal(index, saved)
      setError('')
      setMessage(`${dayNames[item.dayOfWeek]} je sačuvan.`)
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Radno vreme nije moguće sačuvati.'))
    }
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
    }
  }

  async function removeException(exception: WorkingHoursException) {
    if (!window.confirm(`Obrisati izuzetak za ${exception.date}?`)) return
    try {
      await workingHoursApi.deleteException(exception)
      await reloadExceptions()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Izuzetak nije moguće obrisati.'))
    }
  }

  return (
    <main className="workspace">
      <div className="page-heading">
        <div><p className="eyebrow">Poslovna pravila</p><h1>Radno vreme</h1></div>
        <span>Europe/Belgrade</span>
      </div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {message && <p className="success-banner" role="status">{message}</p>}
      <section className="panel weekly-hours">
        <h2>Nedeljni raspored</h2>
        {hours.map((item, index) => <div className="hours-row" key={item.dayOfWeek}>
          <strong>{dayNames[item.dayOfWeek]}</strong>
          <label className="inline-toggle"><input type="checkbox" checked={item.active}
            onChange={(event) => updateLocal(index, { active: event.target.checked })} /> Radi</label>
          <label>Otvaranje<input type="time" value={item.openTime.slice(0, 5)}
            onChange={(event) => updateLocal(index, { openTime: event.target.value })} /></label>
          <label>Zatvaranje<input type="time" value={item.closeTime.slice(0, 5)}
            onChange={(event) => updateLocal(index, { closeTime: event.target.value })} /></label>
          <span className="overnight-hint">{item.closeTime < item.openTime ? 'Smena prelazi ponoć' : ''}</span>
          <button type="button" onClick={() => void saveDay(index)}>Sačuvaj</button>
        </div>)}
      </section>
      <div className="panel-grid settings-grid">
        <form className="panel" onSubmit={saveException}>
          <h2>{editingException ? 'Izmeni izuzetak' : 'Novi izuzetak'}</h2>
          <label>Datum<input type="date" required min={minimumDate}
            value={exceptionForm.date} onChange={(event) => setExceptionForm({ ...exceptionForm, date: event.target.value })} /></label>
          <label>Opis<input maxLength={500} value={exceptionForm.description}
            onChange={(event) => setExceptionForm({ ...exceptionForm, description: event.target.value })} /></label>
          <label className="inline-toggle"><input type="checkbox" checked={exceptionForm.fullDayClosed}
            onChange={(event) => setExceptionForm({
              ...exceptionForm,
              fullDayClosed: event.target.checked,
              overrideOpenTime: undefined,
              overrideCloseTime: undefined,
            })} /> Ceo dan zatvoreno</label>
          {!exceptionForm.fullDayClosed && <>
            <label>Otvaranje<input type="time" required value={exceptionForm.overrideOpenTime ?? ''}
              onChange={(event) => setExceptionForm({ ...exceptionForm, overrideOpenTime: event.target.value })} /></label>
            <label>Zatvaranje<input type="time" required value={exceptionForm.overrideCloseTime ?? ''}
              onChange={(event) => setExceptionForm({ ...exceptionForm, overrideCloseTime: event.target.value })} /></label>
            {exceptionForm.overrideOpenTime && exceptionForm.overrideCloseTime
              && exceptionForm.overrideCloseTime < exceptionForm.overrideOpenTime
              && <span className="overnight-hint">Izuzetak prelazi ponoć</span>}
          </>}
          <div className="form-actions"><button type="submit">Sačuvaj izuzetak</button>
            {editingException && <button className="secondary-button" type="button" onClick={resetException}>Odustani</button>}</div>
        </form>
        <section className="panel">
          <h2>Budući izuzeci</h2>
          {!exceptions.length && <p className="empty-state compact">Nema definisanih izuzetaka.</p>}
          {exceptions.map((exception) => <article className="exception-row" key={exception.id}>
            <div><strong>{exception.date}</strong><p>{exception.description || 'Bez opisa'}</p>
              <small>{exception.fullDayClosed ? 'Ceo dan zatvoreno'
                : `${exception.overrideOpenTime?.slice(0, 5)}–${exception.overrideCloseTime?.slice(0, 5)}`}</small></div>
            <div className="form-actions"><button type="button" onClick={() => startExceptionEdit(exception)}>Izmeni</button>
              <button className="danger-button" type="button" onClick={() => void removeException(exception)}>Obriši</button></div>
          </article>)}
        </section>
      </div>
    </main>
  )
}

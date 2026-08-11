import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { catalogApi } from '../api/catalogApi'
import { apiErrorMessage } from '../api/client'
import { reservationApi } from '../api/reservationApi'
import { userApi } from '../api/userApi'
import { workingHoursApi } from '../api/workingHoursApi'
import { businessLocalToInstant, formatBusinessDateTime } from '../reservations/dateTime'
import type { CatalogItem } from '../types/catalog.types'
import type { PageResponse } from '../types/api.types'
import type { Reservation, ReservationStatus } from '../types/reservation.types'
import type { UserResponse } from '../types/user.types'
import type { WorkingHours } from '../types/workingHours.types'
import { IdempotencyKeyManager, isConflictResponse } from '../api/idempotency'
import { useSearchParams } from 'react-router-dom'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'

export function MyReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState<PageResponse<Reservation> | null>(null)
  const [services, setServices] = useState<CatalogItem[]>([])
  const [employees, setEmployees] = useState<UserResponse[]>([])
  const [hours, setHours] = useState<WorkingHours[]>([])
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState<ReservationStatus | ''>('')
  const [serviceId, setServiceId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [localStart, setLocalStart] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const createAttempt = useRef(new IdempotencyKeyManager())
  const submitInFlight = useRef(false)

  const loadMine = useCallback(async () => {
    setResult(await reservationApi.mine({
      page, size: 20, status: status || undefined,
    }))
  }, [page, status])

  useEffect(() => {
    void Promise.all([
      reservationApi.mine({ page, size: 20, status: status || undefined }),
      catalogApi.list({ page: 0, size: 100, type: 'SERVICE', active: true, sort: 'name', direction: 'ASC' }),
      userApi.employees(),
      workingHoursApi.list(),
    ]).then(([reservations, servicePage, employeePage, weeklyHours]) => {
      setResult(reservations)
      setServices(servicePage.content)
      setEmployees(employeePage)
      setHours(weeklyHours)
    }).catch((cause) => setError(apiErrorMessage(cause, 'Rezervacije nije moguće učitati.')))
  }, [page, status])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (submitInFlight.current) return
    submitInFlight.current = true
    setSubmitting(true)
    try {
      await reservationApi.create({
        serviceId,
        employeeId,
        startTime: businessLocalToInstant(localStart),
        note: note || undefined,
      }, createAttempt.current.begin())
      createAttempt.current.succeeded()
      setLocalStart('')
      setNote('')
      setMessage('Zahtev za termin je poslat.')
      await loadMine()
    } catch (cause) {
      createAttempt.current.failed(cause)
      setError(isConflictResponse(cause)
        ? 'Termin ili podaci su promenjeni. Osvežite prikaz pre novog pokušaja.'
        : apiErrorMessage(cause, 'Termin nije moguće rezervisati. Isti zahtev možete pokušati ponovo.'))
    } finally {
      submitInFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <main className="workspace">
      <div className="page-heading"><div><p className="eyebrow">Zakazivanje</p><h1>Moji termini</h1></div></div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {message && <p className="success-banner" role="status">{message}</p>}
      <div className="panel-grid booking-grid">
        <form className="panel" onSubmit={create}>
          <h2>Novi termin</h2>
          <label>Usluga<select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            <option value="">Izaberite uslugu</option>{services.map((service) =>
              <option value={service.id} key={service.id}>{service.name} · {service.durationMinutes} min</option>)}
          </select></label>
          <label>Zaposleni<select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">Izaberite zaposlenog</option>{employees.map((employee) =>
              <option value={employee.id} key={employee.id}>{employee.name}</option>)}
          </select></label>
          <label>Početak — Europe/Belgrade<input type="datetime-local" required value={localStart}
            onChange={(event) => setLocalStart(event.target.value)} /></label>
          <label>Napomena<textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Slanje…' : 'Pošalji zahtev'}
          </button>
        </form>
        <section className="panel">
          <h2>Radno vreme</h2>
          {hours.map((item) => <div className="schedule-line" key={item.dayOfWeek}>
            <span>{item.dayOfWeek}</span><strong>{item.active
              ? `${item.openTime.slice(0, 5)}–${item.closeTime.slice(0, 5)}${item.spansMidnight ? ' (+1)' : ''}`
              : 'Neradno'}</strong></div>)}
          <p>Prikaz je informativan; backend proverava praznike, trajanje i zauzetost.</p>
        </section>
      </div>
      <div className="list-filter"><label>Status<select value={status}
        onChange={(event) => { setStatus(event.target.value as ReservationStatus | ''); setPage(0) }}>
        <option value="">Svi</option>{['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'].map((value) =>
          <option value={value} key={value}>{value}</option>)}</select></label></div>
      <section className="reservation-list">
        {!result?.content.length && <p className="empty-state">Nemate rezervacije za izabrani filter.</p>}
        {result?.content.map((reservation) => <article className="panel reservation-row" key={reservation.id}>
          <div><strong>{formatBusinessDateTime(reservation.startTime)}</strong>
            <p>{services.find((service) => service.id === reservation.serviceId)?.name ?? 'Usluga'}</p></div>
          <span className="status-badge neutral">{reservation.status}</span>
          <button type="button" onClick={() => {
            const next = new URLSearchParams(searchParams)
            next.set('reservationId', reservation.id)
            setSearchParams(next)
          }}>Detalji</button>
        </article>)}
      </section>
      <div className="pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Prethodna</button>
        <span>Strana {page + 1} od {Math.max(result?.totalPages ?? 1, 1)}</span>
        <button disabled={!result || page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Sledeća</button></div>
      <ReservationDetailsDrawer reservationId={searchParams.get('reservationId')} onChanged={loadMine}
        onClose={() => {
          const next = new URLSearchParams(searchParams)
          next.delete('reservationId')
          setSearchParams(next, { replace: true })
        }} />
    </main>
  )
}

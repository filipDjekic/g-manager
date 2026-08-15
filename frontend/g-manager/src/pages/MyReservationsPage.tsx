import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { availabilityApi } from '../api/availabilityApi'
import { catalogApi } from '../api/catalogApi'
import { apiErrorMessage } from '../api/client'
import { IdempotencyKeyManager, isConflictResponse } from '../api/idempotency'
import { reservationApi } from '../api/reservationApi'
import { waitlistApi } from '../api/waitlistApi'
import { userApi } from '../api/userApi'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { businessLocalToInstant, formatBusinessDateTime, formatBusinessTime, todayInBusinessZone } from '../reservations/dateTime'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import type { CatalogItem } from '../types/catalog.types'
import type { PageResponse } from '../types/api.types'
import type { Reservation, ReservationStatus } from '../types/reservation.types'
import type { RecurrenceConflictPolicy, RecurrenceFrequency, RecurrencePreview } from '../types/reservation.types'
import type { UserResponse } from '../types/user.types'
import type { WaitlistEntry } from '../types/waitlist.types'

type EmployeeChoice = 'UNSELECTED' | 'ANY' | string

export function MyReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState<PageResponse<Reservation> | null>(null)
  const [services, setServices] = useState<CatalogItem[]>([])
  const [employees, setEmployees] = useState<UserResponse[]>([])
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [waitlistTime, setWaitlistTime] = useState('')
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState<ReservationStatus | ''>('')
  const [serviceId, setServiceId] = useState(() => searchParams.get('serviceId')
    ?? sessionStorage.getItem('gmanager.catalog-selection') ?? '')
  const [resourceId] = useState(() => searchParams.get('resourceId') ?? '')
  const [employeeChoice, setEmployeeChoice] = useState<EmployeeChoice>('UNSELECTED')
  const [date, setDate] = useState('')
  const [selectedStart, setSelectedStart] = useState('')
  const [note, setNote] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('WEEKLY')
  const [recurrenceInterval, setRecurrenceInterval] = useState(1)
  const [occurrences, setOccurrences] = useState(4)
  const [conflictPolicy, setConflictPolicy] = useState<RecurrenceConflictPolicy>('ALL_OR_NOTHING')
  const [recurrencePreview, setRecurrencePreview] = useState<RecurrencePreview | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const createAttempt = useRef(new IdempotencyKeyManager())
  const submitInFlight = useRef(false)

  useEffect(() => {
    if (serviceId && sessionStorage.getItem('gmanager.catalog-selection') === serviceId) {
      sessionStorage.removeItem('gmanager.catalog-selection')
    }
  }, [serviceId])

  const loadMine = useCallback(async () => {
    setResult(await reservationApi.mine({ page, size: 20, status: status || undefined }))
  }, [page, status])

  useEffect(() => {
    void Promise.all([
      reservationApi.mine({ page, size: 20, status: status || undefined }),
      catalogApi.list({ page: 0, size: 100, type: 'SERVICE', active: true, sort: 'name', direction: 'ASC' }),
      userApi.employees(),
      waitlistApi.mine(),
    ]).then(([reservations, servicePage, employeePage, waitlistEntries]) => {
      setResult(reservations)
      setServices(servicePage.content)
      setEmployees(employeePage)
      setWaitlist(waitlistEntries)
    }).catch((cause) => setError(apiErrorMessage(cause, 'Rezervacije nije moguće učitati.')))
  }, [page, status])

  const availability = useQuery({
    queryKey: ['availability', serviceId, employeeChoice, date],
    queryFn: () => availabilityApi.find({
      serviceId,
      employeeId: employeeChoice === 'ANY' ? undefined : employeeChoice,
      from: date,
      to: date,
    }),
    enabled: Boolean(serviceId && employeeChoice !== 'UNSELECTED' && date),
    retry: false,
  })
  const slots = useMemo(() => {
    const unique = new Map<string, string>()
    availability.data?.employees.forEach((employee) => employee.slots.forEach((slot) => {
      if (!unique.has(slot.startTime)) unique.set(slot.startTime, slot.endTime)
    }))
    return [...unique].map(([startTime, endTime]) => ({ startTime, endTime }))
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
  }, [availability.data])
  const service = services.find((item) => item.id === serviceId)
  const employeeLabel = employeeChoice === 'ANY' ? 'Bilo koji slobodan zaposleni'
    : employees.find((employee) => employee.id === employeeChoice)?.name

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!selectedStart || submitInFlight.current) return
    submitInFlight.current = true
    setSubmitting(true)
    setError('')
    try {
      const baseInput = {
        serviceId,
        resourceId: resourceId || undefined,
        employeeId: employeeChoice === 'ANY' ? undefined : employeeChoice,
        startTime: selectedStart,
        note: note || undefined,
      }
      if (recurring) {
        if (employeeChoice === 'ANY' || employeeChoice === 'UNSELECTED') return
        const created = await reservationApi.createRecurrence({
          ...baseInput, employeeId: employeeChoice, frequency, interval: recurrenceInterval,
          occurrences, conflictPolicy,
        }, createAttempt.current.begin())
        setMessage(`Kreirano rezervacija: ${created.created.length}; preskočeno: ${created.skipped.length}.`)
      } else {
        await reservationApi.create(baseInput, createAttempt.current.begin())
        setMessage('Termin je rezervisan i čeka potvrdu.')
      }
      createAttempt.current.succeeded()
      setServiceId('')
      setEmployeeChoice('UNSELECTED')
      setDate('')
      setSelectedStart('')
      setNote('')
      setRecurring(false)
      setRecurrencePreview(null)
      await loadMine()
    } catch (cause) {
      createAttempt.current.failed(cause)
      if (isConflictResponse(cause)) {
        setSelectedStart('')
        setError('Izabrani termin je upravo zauzet. Osvežili smo dostupne termine — izaberite drugi slot.')
        await availability.refetch()
      } else {
        setError(apiErrorMessage(cause, 'Termin nije moguće rezervisati. Pokušajte ponovo.'))
      }
    } finally {
      submitInFlight.current = false
      setSubmitting(false)
    }
  }

  async function previewRecurrence() {
    if (!selectedStart || employeeChoice === 'ANY' || employeeChoice === 'UNSELECTED') return
    try {
      setRecurrencePreview(await reservationApi.previewRecurrence({
        serviceId, employeeId: employeeChoice, startTime: selectedStart, note: note || undefined,
        frequency, interval: recurrenceInterval, occurrences, conflictPolicy,
      }))
      setError('')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Ponavljanje nije moguće pregledati.'))
    }
  }

  async function joinWaitlist() {
    if (!serviceId || !date || !waitlistTime || employeeChoice === 'ANY' || employeeChoice === 'UNSELECTED') return
    try {
      await waitlistApi.join({ serviceId, employeeId: employeeChoice, resourceId: resourceId || undefined, desiredStart: businessLocalToInstant(`${date}T${waitlistTime}`) })
      setWaitlist(await waitlistApi.mine())
      setWaitlistTime('')
      setError('')
      setMessage('Dodati ste na listu čekanja za izabrani termin.')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Prijava na listu čekanja nije uspela.'))
    }
  }

  async function acceptOffer(entry: WaitlistEntry) {
    if (!entry.offerId) return
    try {
      await waitlistApi.accept(entry.offerId)
      setWaitlist(await waitlistApi.mine())
      await loadMine()
      setError('')
      setMessage('Ponuda je prihvaćena i rezervacija je kreirana.')
    } catch (cause) {
      setWaitlist(await waitlistApi.mine())
      setError(apiErrorMessage(cause, 'Ponuda više nije dostupna.'))
    }
  }

  async function cancelWaitlist(entry: WaitlistEntry) {
    try {
      await waitlistApi.cancel(entry)
      setWaitlist(await waitlistApi.mine())
      setError('')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Prijavu nije moguće otkazati.'))
    }
  }

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Zakazivanje</p><h1>Moji termini</h1></div></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {message && <p className="success-banner" role="status">{message}</p>}
    <form className="panel booking-flow" onSubmit={create}>
      <div className="booking-step"><span>1</span><label>Usluga<select required value={serviceId} onChange={(event) => {
        setServiceId(event.target.value); setEmployeeChoice('UNSELECTED'); setDate(''); setSelectedStart('')
      }}><option value="">Izaberite uslugu</option>{services.map((item) =>
        <option value={item.id} key={item.id}>{item.name} · {item.durationMinutes} min</option>)}</select></label></div>

      {serviceId && <div className="booking-step"><span>2</span><label>Zaposleni<select required
        value={employeeChoice} onChange={(event) => {
          setEmployeeChoice(event.target.value); setDate(''); setSelectedStart('')
        }}><option value="UNSELECTED">Izaberite opciju</option><option value="ANY">Bilo koji slobodan</option>
        {employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label></div>}

      {employeeChoice !== 'UNSELECTED' && <div className="booking-step"><span>3</span><label>Datum<input type="date"
        min={todayInBusinessZone()} required value={date} onChange={(event) => {
          setDate(event.target.value); setSelectedStart('')
        }} /></label></div>}

      {date && <div className="booking-step booking-slot-step"><span>4</span><fieldset><legend>Dostupan termin</legend>
        {availability.isLoading && <Skeleton lines={3} label="Učitavanje dostupnih termina" />}
        {availability.error && <ErrorState message={apiErrorMessage(availability.error, 'Dostupne termine nije moguće učitati.')}
          action={<Button type="button" onClick={() => availability.refetch()}>Pokušaj ponovo</Button>} />}
        {!availability.isLoading && !availability.error && slots.length === 0
          && <><EmptyState title="Nema slobodnih termina" description="Izaberite drugi datum ili se prijavite za konkretan termin." />
            {employeeChoice !== 'ANY' && <div className="form-actions"><label>Željeno vreme<input type="time" value={waitlistTime}
              onChange={(event) => setWaitlistTime(event.target.value)} /></label>
              <Button type="button" disabled={!waitlistTime} onClick={() => void joinWaitlist()}>Prijavi se na listu čekanja</Button></div>}</>}
        {slots.length > 0 && <div className="slot-grid">{slots.map((slot) => <label key={slot.startTime}
          className={selectedStart === slot.startTime ? 'slot-option selected' : 'slot-option'}>
          <input type="radio" name="slot" value={slot.startTime} checked={selectedStart === slot.startTime}
            onChange={() => setSelectedStart(slot.startTime)} />{formatBusinessTime(slot.startTime)}
        </label>)}</div>}
      </fieldset></div>}

      {selectedStart && <div className="booking-step"><span>5</span><label>Napomena (opciono)<textarea maxLength={500}
        value={note} onChange={(event) => setNote(event.target.value)} /></label></div>}

      {selectedStart && employeeChoice !== 'ANY' && <div className="booking-step"><span>6</span><fieldset>
        <legend>Ponavljanje</legend><label className="inline-toggle"><input type="checkbox" checked={recurring}
          onChange={(event) => { setRecurring(event.target.checked); setRecurrencePreview(null) }} /> Ponavljajući termini</label>
        {recurring && <><label>Učestalost<select value={frequency} onChange={(event) => { setFrequency(event.target.value as RecurrenceFrequency); setRecurrencePreview(null) }}>
          <option value="WEEKLY">Nedeljno</option><option value="MONTHLY">Mesečno</option></select></label>
          <label>Interval<input type="number" min="1" max="4" value={recurrenceInterval}
            onChange={(event) => { setRecurrenceInterval(Number(event.target.value)); setRecurrencePreview(null) }} /></label>
          <label>Broj termina<input type="number" min="2" max="20" value={occurrences}
            onChange={(event) => { setOccurrences(Number(event.target.value)); setRecurrencePreview(null) }} /></label>
          <label>Konflikti<select value={conflictPolicy} onChange={(event) => { setConflictPolicy(event.target.value as RecurrenceConflictPolicy); setRecurrencePreview(null) }}>
            <option value="ALL_OR_NOTHING">Ne kreiraj seriju ako postoji konflikt</option>
            <option value="SKIP_CONFLICTS">Preskoči konfliktne termine</option></select></label>
          <Button type="button" variant="secondary" onClick={() => void previewRecurrence()}>Pregledaj ponavljanje</Button>
          {recurrencePreview && <ul>{recurrencePreview.occurrences.map((item) => <li key={item.startTime}>
            {formatBusinessDateTime(item.startTime)} — {item.available ? 'Dostupno' : `Konflikt: ${item.reason}`}</li>)}</ul>}</>}
      </fieldset></div>}

      {selectedStart && <div className="booking-step booking-review"><span>{recurring ? '7' : '6'}</span><section aria-labelledby="booking-review-title">
        <h2 id="booking-review-title">Proverite termin</h2>
        <dl><div><dt>Usluga</dt><dd>{service?.name}</dd></div><div><dt>Zaposleni</dt><dd>{employeeLabel}</dd></div>
          <div><dt>Termin</dt><dd>{formatBusinessDateTime(selectedStart)}</dd></div></dl>
        <Button type="submit" loading={submitting} disabled={recurring && !recurrencePreview}>
          {recurring ? 'Kreiraj seriju' : 'Potvrdi termin'}</Button>
      </section></div>}
    </form>

    <section className="panel">
      <h2>Lista čekanja</h2>
      {!waitlist.length && <p className="empty-state compact">Nemate aktivne ili prethodne prijave.</p>}
      {waitlist.map((entry) => <article className="exception-row" key={entry.id}>
        <div><strong>{formatBusinessDateTime(entry.desiredStart)}</strong>
          <p>{services.find((item) => item.id === entry.serviceId)?.name ?? 'Usluga'} · {entry.status}</p>
          {entry.offerExpiresAt && entry.status === 'OFFERED' && <small>Ponuda važi do {formatBusinessDateTime(entry.offerExpiresAt)}</small>}</div>
        <div className="form-actions">
          {entry.status === 'OFFERED' && <Button type="button" onClick={() => void acceptOffer(entry)}>Prihvati termin</Button>}
          {(entry.status === 'WAITING' || entry.status === 'OFFERED') &&
            <Button type="button" variant="danger" onClick={() => void cancelWaitlist(entry)}>Otkaži prijavu</Button>}
        </div>
      </article>)}
    </section>

    <div className="list-filter"><label>Status<select value={status}
      onChange={(event) => { setStatus(event.target.value as ReservationStatus | ''); setPage(0) }}>
      <option value="">Svi</option>{['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'].map((value) =>
        <option value={value} key={value}>{value}</option>)}</select></label></div>
    <section className="reservation-list">
      {!result?.content.length && <p className="empty-state">Nemate rezervacije za izabrani filter.</p>}
      {result?.content.map((reservation) => <article className="panel reservation-row" key={reservation.id}>
        <div><strong>{formatBusinessDateTime(reservation.startTime)}</strong>
          <p>{services.find((item) => item.id === reservation.serviceId)?.name ?? 'Usluga'}</p></div>
        <span className="status-badge neutral">{reservation.status}</span>
        <button type="button" onClick={() => {
          const next = new URLSearchParams(searchParams); next.set('reservationId', reservation.id); setSearchParams(next)
        }}>Detalji</button>
      </article>)}
    </section>
    <div className="pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Prethodna</button>
      <span>Strana {page + 1} od {Math.max(result?.totalPages ?? 1, 1)}</span>
      <button disabled={!result || page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Sledeća</button></div>
    <ReservationDetailsDrawer reservationId={searchParams.get('reservationId')} onChanged={loadMine}
      onClose={() => { const next = new URLSearchParams(searchParams); next.delete('reservationId'); setSearchParams(next, { replace: true }) }} />
  </main>
}

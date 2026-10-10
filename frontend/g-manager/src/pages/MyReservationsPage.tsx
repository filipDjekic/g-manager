import { reservationLabels, reservationTones } from '../components/ui/statusPresentation'
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { availabilityApi } from '../api/availabilityApi'
import { catalogApi } from '../api/catalogApi'
import { apiErrorMessage } from '../api/client'
import { IdempotencyKeyManager, isConflictResponse } from '../api/idempotency'
import { resourceApi } from '../api/resourceApi'
import type { AvailabilitySlot } from '../types/availability.types'
import { reservationApi } from '../api/reservationApi'
import { waitlistApi } from '../api/waitlistApi'
import { userApi } from '../api/userApi'
import { Pagination, Badge, Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { formatBusinessDateTime, formatBusinessTime, todayInBusinessZone } from '../reservations/dateTime'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import type { CatalogItem } from '../types/catalog.types'
import type { PageResponse } from '../types/api.types'
import type { Reservation, ReservationStatus } from '../types/reservation.types'
import type { RecurrenceConflictPolicy, RecurrenceFrequency, RecurrenceCreateResult, CreateReservationInput, RecurrenceInput, ReservationCreationRequest } from '../types/reservation.types'
import type { UserResponse } from '../types/user.types'
import type { WaitlistEntry } from '../types/waitlist.types'
import { useServerNow } from '../gaming/useServerNow'
import { RecurrencePreviewPanel, RecurrenceResultPanel } from '../reservations/RecurrencePreviewPanel'
import { bookingConflictReason } from '../reservations/bookingConflictReason'
import { useAuthStore } from '../auth/authStore'

type EmployeeChoice = 'UNSELECTED' | 'ANY' | string

export function MyReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState<PageResponse<Reservation> | null>(null)
  const [services, setServices] = useState<CatalogItem[]>([])
  const [employees, setEmployees] = useState<UserResponse[]>([])
  const actorId = useAuthStore(state => state.user?.id)
  const waitlistQuery = useQuery({ queryKey: ['waitlist', 'mine', actorId], queryFn: waitlistApi.mine,
    refetchInterval: 15000, refetchIntervalInBackground: false })
  const waitlist = waitlistQuery.data ?? []
  const [waitlistPending, setWaitlistPending] = useState('')
  const waitlistAction = useRef(false)
  const expiredOffers = useRef(new Set<string>())
  const focusedOffer = useRef('')
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState<ReservationStatus | ''>('')
  const [serviceId, setServiceId] = useState(() => searchParams.get('serviceId')
    ?? sessionStorage.getItem('gmanager.catalog-selection') ?? '')
  const [resourceId,setResourceId] = useState(() => searchParams.get('resourceId') ?? '')
  const [locationId,setLocationId] = useState(() => searchParams.get('locationId') ?? '')
  const [selectedSlot,setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [employeeChoice, setEmployeeChoice] = useState<EmployeeChoice>('UNSELECTED')
  const [date, setDate] = useState('')
  const [selectedStart, setSelectedStart] = useState('')
  const [note, setNote] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('WEEKLY')
  const [recurrenceInterval, setRecurrenceInterval] = useState(1)
  const [occurrences, setOccurrences] = useState(4)
  const [conflictPolicy, setConflictPolicy] = useState<RecurrenceConflictPolicy>('ALL_OR_NOTHING')
  const [recurrenceResult, setRecurrenceResult] = useState<RecurrenceCreateResult | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const createAttempt = useRef(new IdempotencyKeyManager())
  const pendingBooking = useRef<ReservationCreationRequest | null>(null)
  const frozen = Boolean(createAttempt.current.pendingKey())
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
    ]).then(([reservations, servicePage, employeePage]) => {
      setResult(reservations)
      setServices(servicePage.content)
      setEmployees(employeePage)
    }).catch((cause) => setError(apiErrorMessage(cause, 'Rezervacije nije moguće učitati.')))
  }, [page, status])

  const resourceOptions = useQuery({
    queryKey: ['booking-resources', serviceId],
    queryFn: () => resourceApi.bookingOptions({ serviceId }),
    enabled: Boolean(serviceId), retry: false,
  })
  const service = services.find((item) => item.id === serviceId)
  const resources = resourceOptions.data?.resources ?? []
  const selectedResource = resources.find((item) => item.id === resourceId)
  const scopedLocationId = locationId || selectedResource?.locationId || ''
  const resourceRequired = resourceOptions.data?.resourceRequired ?? service?.requiresResource ?? false
  const physicalStep = resourceRequired || resourceId ? 1 : 0
  const locations = [...new Map(resources.map((item) => [item.locationId, item.locationName])).entries()]
  const availability = useQuery({
    queryKey: ['availability', serviceId, employeeChoice, date, resourceId, scopedLocationId],
    queryFn: () => availabilityApi.overview({
      serviceId,
      employeeId: employeeChoice === 'ANY' ? undefined : employeeChoice,
      resourceId:resourceId || undefined,
      locationId:scopedLocationId || undefined,
      from: date,
      to: date,
    }),
    enabled: Boolean(serviceId && employeeChoice !== 'UNSELECTED' && date),
    retry: false, refetchInterval: 15000, refetchIntervalInBackground: false,
  })
  const serverTime = waitlist[0]?.serverTime ?? availability.data?.serverTime
  const now = useServerNow(serverTime)
  const slots = useMemo(() => {
    const unique = new Map<string, AvailabilitySlot>()
    availability.data?.employees.forEach(employee => employee.slots.forEach(slot => {
      const value = { ...slot, employeeId: employee.employeeId, employeeName: employee.employeeName }
      const previous = unique.get(slot.startTime)
      const rank = (item: AvailabilitySlot) => !item.status || item.status === 'AVAILABLE' ? 0 : item.status === 'UNAVAILABLE' ? 2 : 1
      if (!previous || rank(value) < rank(previous)) unique.set(slot.startTime, value)
    }))
    return [...unique.values()].sort((left, right) => left.startTime.localeCompare(right.startTime))
  }, [availability.data])
  // Rebind selection to the current response after polling; old free slots cannot authorize a booking.
  const chosenSlot = selectedSlot?.startTime === selectedStart ? slots.find(slot => slot.startTime === selectedStart
    && slot.employeeId === selectedSlot.employeeId && slot.resourceId === selectedSlot.resourceId) ?? null : null
  const occupied = Boolean(chosenSlot?.status?.startsWith('OCCUPIED_'))
  const actionableSlots = slots.filter(slot => slot.status !== 'UNAVAILABLE')
  const unavailableSlots = slots.filter(slot => slot.status === 'UNAVAILABLE')
  const resolvedResourceId = resourceId || chosenSlot?.resourceId || ''
  const resolvedLocationId = chosenSlot?.locationId || selectedResource?.locationId || scopedLocationId
  const slotResources = useQuery({
    queryKey: ['booking-resources', serviceId, selectedStart, chosenSlot?.endTime],
    queryFn: () => resourceApi.bookingOptions({ serviceId, start: selectedStart, end: chosenSlot!.endTime }),
    enabled: Boolean(serviceId && selectedStart && chosenSlot && !occupied && physicalStep), retry: false,
  })
  const assignedResource = slotResources.data?.resources.find((item) => item.id === resolvedResourceId)
  const resourceUnavailable = Boolean(resolvedResourceId && slotResources.data
    && (!assignedResource || !assignedResource.available))
  const recurrenceInput: RecurrenceInput = { serviceId, resourceId: resolvedResourceId || undefined, locationId: resolvedLocationId || undefined,
    employeeId: employeeChoice, startTime: selectedStart, note: note || undefined, frequency, interval: recurrenceInterval, occurrences, conflictPolicy }
  const recurrenceQuery = useQuery({ queryKey: ['recurrence-preview', JSON.stringify(recurrenceInput)],
    queryFn: () => reservationApi.previewRecurrence(recurrenceInput),
    enabled: Boolean(recurring && selectedStart && employeeChoice !== 'ANY' && employeeChoice !== 'UNSELECTED'),
    retry: false, refetchInterval: 15000, refetchIntervalInBackground: false })
  const activeRecurrencePreview = recurrenceQuery.data
  const canSubmit = Boolean(chosenSlot && (!occupied || recurring) && chosenSlot.status !== 'UNAVAILABLE'
    && !availability.isFetching && !availability.error && !resourceOptions.isLoading && !resourceOptions.error
    && (!physicalStep || (resolvedResourceId && (recurring || (!slotResources.isFetching && !slotResources.error && !resourceUnavailable))))
    && (!recurring || (employeeChoice !== 'ANY' && activeRecurrencePreview && !recurrenceQuery.isFetching && !recurrenceQuery.error
      && activeRecurrencePreview.occurrences.some(item => item.available)
      && (conflictPolicy !== 'ALL_OR_NOTHING' || activeRecurrencePreview.occurrences.every(item => item.available)))))

  useEffect(() => {
    if (!serverTime) return
    const expired = waitlist.filter(entry => entry.status === 'OFFERED' && entry.offerStatus !== 'EXPIRED'
      && entry.offerId && entry.offerExpiresAt && Date.parse(entry.offerExpiresAt) <= now && !expiredOffers.current.has(entry.offerId))
    if (expired.length) {
      expired.forEach(entry => expiredOffers.current.add(entry.offerId!))
      void waitlistQuery.refetch()
    }
  }, [now, serverTime, waitlist, waitlistQuery])
  const linkedOffer = searchParams.get('waitlistOffer')
  useEffect(() => {
    if (linkedOffer && focusedOffer.current !== linkedOffer && waitlist.some(entry => entry.offerId === linkedOffer)) {
      document.getElementById(`offer-${linkedOffer}`)?.scrollIntoView({ block: 'center' })
      focusedOffer.current = linkedOffer
    }
  }, [linkedOffer, waitlist])
  function updateBookingParams(next: { serviceId?: string; resourceId?: string; locationId?: string }) {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      Object.entries(next).forEach(([key,value]) => { if (value) params.set(key,value); else params.delete(key) })
      return params
    }, { replace: true })
  }
  const employeeLabel = employeeChoice === 'ANY' ? 'Bilo koji slobodan zaposleni'
    : employees.find((employee) => employee.id === employeeChoice)?.name

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!selectedStart || (!canSubmit && !frozen) || submitInFlight.current) return
    submitInFlight.current = true
    setSubmitting(true)
    setError('')
    try {
      const baseInput: CreateReservationInput = {
        serviceId,
        resourceId: resolvedResourceId || undefined,
        locationId: resolvedLocationId || undefined,
        employeeId: employeeChoice === 'ANY' ? undefined : employeeChoice,
        startTime: selectedStart,
        note: note || undefined,
      }
      const request: ReservationCreationRequest = pendingBooking.current ?? (recurring
        ? { kind: 'RECURRING', input: { ...baseInput, employeeId: employeeChoice,
          frequency, interval: recurrenceInterval, occurrences, conflictPolicy } }
        : { kind: 'SINGLE', input: baseInput })
      pendingBooking.current = request
      if (request.kind === 'RECURRING') {
        const created = await reservationApi.createRecurrence(request.input, createAttempt.current.begin())
        setRecurrenceResult(created)
        setMessage('Serija je obrađena. Ispod je rezultat za svaki termin.')
      } else {
        await reservationApi.create(request.input, createAttempt.current.begin())
        setMessage('Termin je rezervisan i čeka potvrdu.')
      }
      createAttempt.current.succeeded()
      pendingBooking.current = null
      setPage(0); setStatus('')
      setServiceId('')
      setResourceId('')
      setLocationId('')
      setSelectedSlot(null)
      updateBookingParams({ serviceId: '', resourceId: '', locationId: '' })
      setEmployeeChoice('UNSELECTED')
      setDate('')
      setSelectedStart('')
      setNote('')
      setRecurring(false)
      setResult(await reservationApi.mine({ page: 0, size: 20 }))
    } catch (cause) {
      createAttempt.current.failed(cause)
      if (!createAttempt.current.pendingKey()) pendingBooking.current = null
      if (isConflictResponse(cause)) {
        if (!recurring) setSelectedStart('')
        setError(recurring ? 'Dostupnost serije se promenila. Pregled je osvežen; proverite konflikte pre novog pokušaja.' : 'Izabrani termin je upravo zauzet. Osvežili smo termine — možete se prijaviti na listu čekanja.')
        if (recurring) await recurrenceQuery.refetch()
        await availability.refetch()
      } else {
        setError(apiErrorMessage(cause, 'Termin nije moguće rezervisati. Pokušajte ponovo.'))
      }
    } finally {
      submitInFlight.current = false
      setSubmitting(false)
    }
  }

  async function joinWaitlist() {
    if (!chosenSlot || !occupied || !chosenSlot.employeeId || waitlistAction.current) return
    waitlistAction.current = true; setWaitlistPending('join'); setError(''); setMessage('')
    try {
      await waitlistApi.join({ serviceId, employeeId: chosenSlot.employeeId,
        resourceId: resolvedResourceId || undefined, locationId: resolvedLocationId || undefined, desiredStart: chosenSlot.startTime })
      setMessage('Dodati ste na listu čekanja za izabrani termin.')
      await waitlistQuery.refetch()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Prijava na listu čekanja nije uspela.'))
      await availability.refetch()
    } finally { waitlistAction.current = false; setWaitlistPending('') }
  }

  async function acceptOffer(entry: WaitlistEntry) {
    if (!entry.offerId || !serverTime || !entry.offerExpiresAt || Date.parse(entry.offerExpiresAt) <= now || waitlistAction.current) return
    waitlistAction.current = true; setWaitlistPending(entry.id); setError(''); setMessage('')
    try {
      const accepted = await waitlistApi.accept(entry.offerId)
      if (accepted.status !== 'ACCEPTED' || !accepted.reservationId) throw new Error('Reservation was not confirmed')
      setPage(0); setStatus(''); setMessage('Ponuda je prihvaćena i rezervacija je kreirana.')
      setSearchParams(current => { const params = new URLSearchParams(current); params.set('reservationId', accepted.reservationId!); return params })
      const refreshed = await Promise.allSettled([waitlistQuery.refetch(), reservationApi.mine({ page: 0, size: 20 })])
      if (refreshed[1].status === 'fulfilled') setResult(refreshed[1].value)
      else setError('Rezervacija je kreirana, ali pregled trenutno nije moguće osvežiti.')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Ponuda je istekla ili je termin u međuvremenu zauzet. Rezervacija nije potvrđena.'))
      await waitlistQuery.refetch()
    } finally { waitlistAction.current = false; setWaitlistPending('') }
  }

  async function cancelWaitlist(entry: WaitlistEntry) {
    if (waitlistAction.current) return
    waitlistAction.current = true; setWaitlistPending(entry.id); setError(''); setMessage('')
    try {
      await waitlistApi.cancel(entry)
      setMessage('Prijava na listu čekanja je otkazana.')
      await waitlistQuery.refetch()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Prijavu nije moguće otkazati.'))
      await waitlistQuery.refetch()
    } finally { waitlistAction.current = false; setWaitlistPending('') }
  }

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Zakazivanje</p><h1>Moji termini</h1></div></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {message && <p className="success-banner" role="status">{message}</p>}
    <form className="panel booking-flow" onSubmit={create}>
      <fieldset className="booking-fields" disabled={submitting || frozen}>
      <div className="booking-step"><span>1</span><label>Usluga<select required value={serviceId} onChange={(event) => {
        setServiceId(event.target.value); setResourceId(''); setLocationId(''); setEmployeeChoice('UNSELECTED'); setDate(''); setSelectedStart('')
        updateBookingParams({ serviceId: event.target.value, resourceId: '', locationId: '' })
      }}><option value="">Izaberite uslugu</option>{services.map((item) =>
        <option value={item.id} key={item.id}>{item.name} · {item.durationMinutes} min</option>)}</select></label></div>

      {serviceId && resourceOptions.isLoading && <Skeleton lines={2} label="Učitavanje računara i lokacija" />}
      {serviceId && resourceOptions.error && <ErrorState message={apiErrorMessage(resourceOptions.error, 'Resurse nije moguće učitati.')}
        action={<Button type="button" onClick={() => resourceOptions.refetch()}>Pokušaj ponovo</Button>} />}
      {serviceId && physicalStep > 0 && <div className="booking-step"><span>2</span><fieldset>
        <legend>Lokacija i računar / resurs</legend>
        <label>Lokacija<select value={scopedLocationId} onChange={(event) => {
          const next = event.target.value
          setLocationId(next); setSelectedStart('')
          const keepResource = !next || selectedResource?.locationId === next
          if (!keepResource) setResourceId('')
          updateBookingParams({ locationId: next, resourceId: keepResource ? resourceId : '' })
        }}><option value="">Bilo koja lokacija</option>{locations.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Računar / resurs<select value={resourceId} onChange={(event) => {
          setResourceId(event.target.value); setSelectedStart('')
          updateBookingParams({ resourceId: event.target.value })
        }}><option value="">Automatski izaberi slobodan kompatibilni resurs</option>
          {resourceId && !selectedResource && <option value={resourceId}>Izabrani resurs više nije dostupan</option>}
          {resources.filter((item) => !scopedLocationId || item.locationId === scopedLocationId).map((item) =>
            <option key={item.id} value={item.id}
              >
              {item.code} · {item.name}</option>)}</select></label>
        {resourceRequired && !resourceOptions.isLoading && !resourceOptions.error && !resources.length
          && <p role="alert">Za ovu uslugu trenutno nema kompatibilnih računara ili drugih resursa.</p>}
      </fieldset></div>}
      {serviceId && <div className="booking-step"><span>{2 + physicalStep}</span><label>Zaposleni<select required
        value={employeeChoice} onChange={(event) => {
          setEmployeeChoice(event.target.value); setDate(''); setSelectedStart('')
        }}><option value="UNSELECTED">Izaberite opciju</option><option value="ANY">Bilo koji slobodan</option>
        {employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label></div>}

      {employeeChoice !== 'UNSELECTED' && <div className="booking-step"><span>{3 + physicalStep}</span><label>Datum<input type="date"
        min={todayInBusinessZone()} required value={date} onChange={(event) => {
          setDate(event.target.value); setSelectedStart('')
        }} /></label></div>}

      {date && <div className="booking-step booking-slot-step"><span>{4 + physicalStep}</span><fieldset><legend>Termini</legend>
        <p className="search-help">Slobodne termine možete rezervisati. Za zauzete termine možete se prijaviti na listu čekanja.</p>
        {availability.isLoading && <Skeleton lines={3} label="Učitavanje dostupnih termina" />}
        {availability.error && <ErrorState message={apiErrorMessage(availability.error, 'Dostupne termine nije moguće učitati.')}
          action={<Button type="button" onClick={() => availability.refetch()}>Pokušaj ponovo</Button>} />}
        {!availability.isLoading && !availability.error && actionableSlots.length === 0 && <EmptyState title="Nema termina za rezervisanje ili listu čekanja" description="Proverite poslovna ograničenja ispod ili izaberite drugi datum, zaposlenog ili resurs." />}
        {!availability.error && actionableSlots.length > 0 && <div className="slot-grid occupancy-grid">{actionableSlots.map(slot => <label key={slot.startTime}
          className={`slot-option occupancy-slot ${slot.status?.startsWith('OCCUPIED_') ? 'occupied' : 'available'} ${selectedStart === slot.startTime ? 'selected' : ''}`}>
          <input type="radio" name="slot" value={slot.startTime} checked={selectedStart === slot.startTime} disabled={availability.isFetching || submitting || Boolean(waitlistPending)}
            onChange={() => { setSelectedStart(slot.startTime); setSelectedSlot(slot) }} />
          <strong>{formatBusinessTime(slot.startTime)} – {formatBusinessTime(slot.endTime)}</strong>
          <Badge tone={slot.status?.startsWith('OCCUPIED_') ? 'warning' : 'success'}>{slot.status?.startsWith('OCCUPIED_') ? 'Zauzet' : 'Slobodan'}</Badge>
          {slot.reason && <small>{bookingConflictReason(slot.reason)}</small>}
          <small>{[slot.resourceCode, slot.resourceName, slot.locationName, employeeChoice === 'ANY' ? slot.employeeName : null].filter(Boolean).join(' · ')}</small>
          <span>{slot.status?.startsWith('OCCUPIED_') ? 'Prijavi se na listu čekanja' : 'Rezerviši termin'}</span>
        </label>)}</div>}
        {!availability.error && unavailableSlots.length > 0 && <details className="unavailable-slots"><summary>Nedostupni termini ({unavailableSlots.length})</summary>
          <ul>{unavailableSlots.map(slot => <li key={slot.startTime}><strong>{formatBusinessTime(slot.startTime)}</strong> · {bookingConflictReason(slot.reason)}</li>)}</ul>
        </details>}
      </fieldset></div>}

      {selectedStart && chosenSlot && (!occupied || recurring) && chosenSlot.status !== 'UNAVAILABLE' && <div className="booking-step"><span>{5 + physicalStep}</span><label>Napomena (opciono)<textarea maxLength={500}
        value={note} onChange={(event) => setNote(event.target.value)} /></label></div>}

      {selectedStart && chosenSlot && chosenSlot.status !== 'UNAVAILABLE' && employeeChoice !== 'ANY' && <div className="booking-step"><span>{6 + physicalStep}</span><fieldset>
        <legend>Ponavljanje</legend><label className="inline-toggle"><input type="checkbox" checked={recurring}
          onChange={(event) => { setRecurring(event.target.checked) }} /> Ponavljajući termini</label>
        {recurring && physicalStep > 0 && <p>Za svaki termin prikazan je resurs koji je trenutno dostupan.</p>}
        {recurring && <><label>Učestalost<select value={frequency} onChange={(event) => { setFrequency(event.target.value as RecurrenceFrequency) }}>
          <option value="WEEKLY">Nedeljno</option><option value="MONTHLY">Mesečno</option></select></label>
          <label>Interval<input type="number" min="1" max="4" value={recurrenceInterval}
            onChange={(event) => { setRecurrenceInterval(Number(event.target.value)) }} /></label>
          <label>Broj termina<input type="number" min="2" max="20" value={occurrences}
            onChange={(event) => { setOccurrences(Number(event.target.value)) }} /></label>
          <label>Konflikti<select value={conflictPolicy} onChange={(event) => { setConflictPolicy(event.target.value as RecurrenceConflictPolicy) }}>
            <option value="ALL_OR_NOTHING">Ne kreiraj seriju ako postoji konflikt</option>
            <option value="SKIP_CONFLICTS">Preskoči konfliktne termine</option></select></label>
          <Button type="button" variant="secondary" loading={recurrenceQuery.isFetching} onClick={() => void recurrenceQuery.refetch()}>Pregledaj ponavljanje</Button>
          {recurrenceQuery.isLoading && <Skeleton lines={3} label="Provera ponavljajućih termina" />}
          {recurrenceQuery.error && <ErrorState message={apiErrorMessage(recurrenceQuery.error, 'Ponavljanje nije moguće pregledati.')} action={<Button type="button" onClick={() => recurrenceQuery.refetch()}>Pokušaj ponovo</Button>} />}
          {activeRecurrencePreview && <RecurrencePreviewPanel preview={activeRecurrencePreview} policy={conflictPolicy} />}</>}

      </fieldset></div>}

      </fieldset>
      {selectedStart && <div className="booking-step booking-review"><span>{(recurring ? 7 : 6) + physicalStep}</span><section aria-labelledby="booking-review-title">
        <h2 id="booking-review-title">Proverite termin</h2>
        <dl><div><dt>Usluga</dt><dd>{service?.name}</dd></div><div><dt>Zaposleni</dt><dd>{occupied ? chosenSlot?.employeeName : employeeLabel}</dd></div>
          <div><dt>Lokacija</dt><dd>{chosenSlot?.locationName || selectedResource?.locationName || 'Poslovna lokacija'}</dd></div>
          <div><dt>Računar / resurs</dt><dd>{resolvedResourceId
            ? `${chosenSlot?.resourceCode || selectedResource?.code || assignedResource?.code || ''} · ${chosenSlot?.resourceName || selectedResource?.name || assignedResource?.name || ''}`
            : resourceRequired ? 'Resurs još nije dodeljen' : 'Usluga ne zahteva resurs'}</dd></div>
          <div><dt>Datum i vreme</dt><dd>{formatBusinessDateTime(selectedStart)} – {chosenSlot && formatBusinessTime(chosenSlot.endTime)}</dd></div></dl>
        {!occupied && physicalStep > 0 && slotResources.isFetching && <p role="status">Provera dostupnosti računara…</p>}
        {!occupied && slotResources.error && <ErrorState message={apiErrorMessage(slotResources.error, 'Dostupnost računara nije moguće proveriti.')}
          action={<Button type="button" onClick={() => slotResources.refetch()}>Pokušaj ponovo</Button>} />}
        {!occupied && resourceUnavailable && <p role="alert">Izabrani resurs više nije dostupan za rezervisanje. Osvežite pregled termina.</p>}
        {chosenSlot?.status === 'UNAVAILABLE' && !frozen ? <p className="warning-banner">{bookingConflictReason(chosenSlot.reason)}</p> : occupied && !recurring && !frozen ? <><p className="warning-banner">{bookingConflictReason(chosenSlot?.reason)}</p>
          <Button type="button" loading={waitlistPending === 'join'} disabled={submitting || Boolean(waitlistPending) || availability.isFetching || Boolean(availability.error)} onClick={() => void joinWaitlist()}>Prijavi se na listu čekanja</Button></>
          : <Button type="submit" loading={submitting} disabled={!canSubmit && !frozen}>{frozen ? 'Ponovi isti zahtev' : recurring ? 'Kreiraj seriju' : 'Potvrdi termin'}</Button>}
        {frozen && <p role="status">Prethodni zahtev čeka konačan ishod. Ponovite isti zahtev da biste dobili njegov rezultat.</p>}
        {!chosenSlot && <p className="warning-banner">Termin se promenio. Izaberite ga ponovo iz ažuriranog pregleda.</p>}
      </section></div>}
    </form>

    {recurrenceResult && <RecurrenceResultPanel result={recurrenceResult} />}
    <section className="panel" aria-labelledby="my-waitlist-title">
      <div className="page-heading"><h2 id="my-waitlist-title">Lista čekanja</h2><Button variant="secondary" loading={waitlistQuery.isFetching} onClick={() => waitlistQuery.refetch()}>Osveži listu čekanja</Button></div>
      {waitlistQuery.isLoading && <Skeleton lines={3} label="Učitavanje liste čekanja" />}
      {waitlistQuery.error && <ErrorState message={apiErrorMessage(waitlistQuery.error, 'Listu čekanja nije moguće osvežiti.')} action={<Button onClick={() => waitlistQuery.refetch()}>Pokušaj ponovo</Button>} />}
      {!waitlistQuery.isLoading && !waitlistQuery.error && !waitlist.length && <EmptyState title="Nemate prijave na listi čekanja" description="Izaberite konkretan zauzet termin da biste se prijavili." />}
      {waitlist.map(entry => {
        const expired = entry.offerStatus === 'EXPIRED' || Boolean(serverTime && entry.offerExpiresAt && Date.parse(entry.offerExpiresAt) <= now)
        const active = entry.status === 'OFFERED' && !expired
        const seconds = serverTime && entry.offerExpiresAt ? Math.max(0, Math.ceil((Date.parse(entry.offerExpiresAt) - now) / 1000)) : null
        const labels = { WAITING: 'Čeka termin', OFFERED: expired ? 'Ponuda istekla' : 'Aktivna ponuda', ACCEPTED: 'Prihvaćeno', CANCELLED: 'Otkazano' }
        return <article className={`waitlist-offer ${active ? 'active' : ''} ${entry.offerId === linkedOffer ? 'linked' : ''}`} key={entry.id} id={entry.offerId ? `offer-${entry.offerId}` : undefined}>
          <div><strong>{entry.serviceName ?? services.find(item => item.id === entry.serviceId)?.name ?? 'Usluga'}</strong>
            <p>{formatBusinessDateTime(entry.desiredStart)}{entry.desiredEnd && ` – ${formatBusinessTime(entry.desiredEnd)}`}</p>
            <p>{[entry.locationName, entry.resourceCode, entry.resourceName, entry.employeeName].filter(Boolean).join(' · ') || 'Bez određenog resursa'}</p>
            <Badge tone={active ? 'success' : expired && entry.status !== 'ACCEPTED' && entry.status !== 'CANCELLED' ? 'warning' : 'neutral'}>{labels[entry.status]}</Badge>
            {entry.offerExpiresAt && entry.status === 'OFFERED' && <p>Ponuda važi do <time dateTime={entry.offerExpiresAt}>{formatBusinessDateTime(entry.offerExpiresAt, true)}</time></p>}
            {active && <p className="offer-countdown" role="timer" aria-label="Preostalo vreme ponude">{seconds === null ? 'Sinhronizacija vremena…' : `Preostalo: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</p>}
            {expired && (entry.status === 'OFFERED' || entry.status === 'WAITING') && <p className="search-help">Ponuda je istekla. Prijava ostaje na listi čekanja za novu proveru dostupnosti.</p>}
          </div><div className="form-actions">
            {entry.status === 'OFFERED' && <Button type="button" loading={waitlistPending === entry.id} disabled={!active || !serverTime || Date.parse(entry.desiredStart) <= now || Boolean(waitlistPending) || Boolean(waitlistQuery.error)} onClick={() => void acceptOffer(entry)}>Prihvati termin</Button>}
            {(entry.status === 'WAITING' || entry.status === 'OFFERED') && <Button type="button" variant="danger" disabled={Boolean(waitlistPending)} onClick={() => void cancelWaitlist(entry)}>Otkaži prijavu</Button>}
          </div>
        </article>
      })}
    </section>

    <div className="list-filter"><label>Status<select value={status}
      onChange={(event) => { setStatus(event.target.value as ReservationStatus | ''); setPage(0) }}>
      <option value="">Svi</option>{['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'].map((value) =>
        <option value={value} key={value}>{reservationLabels[value as ReservationStatus]}</option>)}</select></label></div>
    <section className="reservation-list">
      {!result?.content.length && <p className="empty-state">Nemate rezervacije za izabrani filter.</p>}
      {result?.content.map((reservation) => <article className="panel reservation-row" key={reservation.id}>
        <div><strong>{formatBusinessDateTime(reservation.startTime)}</strong>
          <p>{services.find((item) => item.id === reservation.serviceId)?.name ?? 'Usluga'}</p>
          {reservation.resourceId && <p>{reservation.resourceCode} · {reservation.resourceName} · {reservation.locationName}</p>}
          {reservation.resourceRequired && !reservation.resourceId && <p className="error-banner">Resurs nije dodeljen — potrebno je da osoblje razreši rezervaciju.</p>}</div>
        <Badge tone={reservationTones[reservation.status]}>{reservationLabels[reservation.status]}</Badge>
        <button type="button" onClick={() => {
          const next = new URLSearchParams(searchParams); next.set('reservationId', reservation.id); setSearchParams(next)
        }}>Detalji</button>
      </article>)}
    </section>
    <Pagination page={page} totalPages={result?.totalPages} onPageChange={setPage} loading={!result} />
    <ReservationDetailsDrawer reservationId={searchParams.get('reservationId')} onChanged={loadMine}
      onClose={() => { const next = new URLSearchParams(searchParams); next.delete('reservationId'); setSearchParams(next, { replace: true }) }} />
  </main>
}

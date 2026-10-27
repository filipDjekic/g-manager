import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { availabilityApi } from '../../api/availabilityApi'
import { resourceApi } from '../../api/resourceApi'
import { reservationApi } from '../../api/reservationApi'
import { waitlistApi } from '../../api/waitlistApi'
import { IdempotencyKeyManager, isConflictResponse } from '../../api/idempotency'
import { Badge, Button, EmptyState, ErrorState, Input, Modal, Select, Skeleton, Textarea } from '../../components/ui'
import { useToast } from '../../components/ui/toastContext'
import { businessInstantToLocal, businessLocalToInstant, formatBusinessDateTime, formatBusinessIntervalEnd, formatBusinessTime, todayInBusinessZone } from '../dateTime'
import { RecurrencePreviewPanel, RecurrenceResultPanel } from '../RecurrencePreviewPanel'
import { ReservationTimePicker } from '../ReservationTimePicker'
import { validTime } from '../ReservationTimePicker.model'
import { bookingConflictReason } from '../bookingConflictReason'
import type { CatalogItem } from '../../types/catalog.types'
import type { UserResponse } from '../../types/user.types'
import type { AvailabilitySlot } from '../../types/availability.types'
import type { CreateReservationInput, RecurrenceConflictPolicy, RecurrenceCreateResult, RecurrenceFrequency, RecurrenceInput, ReservationCreationRequest } from '../../types/reservation.types'
import { CalendarClock } from './customerPresentation'
import { customerDuration, customerReservationError } from './customerPresentation.model'

export interface BookingPrefill { serviceId?: string; resourceId?: string; locationId?: string; areaId?: string; employeeId?: string }
export function CustomerBookingDialog({ prefill, services, employees, loading, dataError, returnFocusRef, onReload, onScopeChanged, onCreated, onWaitlisted, onClose }: {
  prefill: BookingPrefill; services: CatalogItem[]; employees: UserResponse[]; loading: boolean; dataError: unknown
  returnFocusRef: RefObject<HTMLElement | null>; onReload: () => void; onScopeChanged: (value: BookingPrefill) => void
  onCreated: (id?: string) => Promise<void>; onWaitlisted: () => Promise<void>; onClose: () => void
}) {
  const id = useId(), toast = useToast()
  const [serviceId, setServiceId] = useState(prefill.serviceId ?? ''), [resourceId, setResourceId] = useState(prefill.resourceId ?? '')
  const [locationId, setLocationId] = useState(prefill.locationId ?? ''), [areaId, setAreaId] = useState(prefill.areaId ?? '')
  const [employeeChoice, setEmployeeChoice] = useState(prefill.employeeId ?? 'UNSELECTED'), [date, setDate] = useState('')
  const [fromTime, setFromTime] = useState(''), [toTime, setToTime] = useState(''), [endDate, setEndDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null), [selectedStart, setSelectedStart] = useState(''), [note, setNote] = useState('')
  const [recurring, setRecurring] = useState(false), [frequency, setFrequency] = useState<RecurrenceFrequency>('WEEKLY')
  const [recurrenceInterval, setRecurrenceInterval] = useState(1), [occurrences, setOccurrences] = useState(4)
  const [conflictPolicy, setConflictPolicy] = useState<RecurrenceConflictPolicy>('ALL_OR_NOTHING'), [recurrenceResult, setRecurrenceResult] = useState<RecurrenceCreateResult | null>(null)
  const [error, setError] = useState(''), [submitting, setSubmitting] = useState(false), [joining, setJoining] = useState(false)
  const [keys] = useState(() => new IdempotencyKeyManager()), pending = useRef<ReservationCreationRequest | null>(null), inFlight = useRef(false)
  const frozen = Boolean(keys.pendingKey()), blocked = submitting || frozen || joining
  const service = services.find(value => value.id === serviceId)
  const employeeValid = employeeChoice === 'ANY' || employees.some(value => value.id === employeeChoice)
  const resourceOptions = useQuery({ queryKey: ['booking-resources', 'customer-rules', serviceId], queryFn: () => resourceApi.bookingOptions({ serviceId }), enabled: Boolean(serviceId), retry: false })
  const rules = resourceOptions.isError ? undefined : resourceOptions.data, resources = rules?.resources ?? []
  const selectedResource = resources.find(value => value.id === resourceId), scopedLocationId = locationId || selectedResource?.locationId || ''
  const scopedAreaId = areaId || selectedResource?.areaId || '', resourceRequired = rules?.resourceRequired ?? service?.requiresResource ?? false
  const physicalStep = resourceRequired || Boolean(resourceId), scopeReady = !resourceRequired || Boolean(scopedLocationId && scopedAreaId)
  const locations = [...new Map(resources.map(value => [value.locationId, value.locationName])).entries()]
  const areas = [...new Map(resources.filter(value => !scopedLocationId || value.locationId === scopedLocationId).filter(value => value.areaId)
    .map(value => [value.areaId!, value.areaName || value.areaId!])).entries()]
  const minimum = rules?.variableDuration ? Math.max(30, rules.minimumDurationMinutes) : rules?.minimumDurationMinutes ?? 30
  const defaultDuration = rules?.variableDuration ? Math.min(rules.maximumDurationMinutes, Math.max(minimum, rules.defaultDurationMinutes)) : rules?.defaultDurationMinutes ?? service?.durationMinutes ?? 30
  let manualStart = '', timeError = '', duration = defaultDuration
  if (rules?.variableDuration && (fromTime || toTime)) {
    if (!date || !validTime(fromTime) || !validTime(toTime) || !endDate) timeError = 'Unesite početak i kraj u formatu HH:mm.'
    else try {
      manualStart = businessLocalToInstant(`${date}T${fromTime}`)
      const end = businessLocalToInstant(`${endDate}T${toTime}`)
      duration = (Date.parse(end) - Date.parse(manualStart)) / 60000
      if (!Number.isInteger(duration) || duration <= 0) timeError = 'Kraj mora biti posle početka. Za termin preko ponoći promenite datum završetka.'
      else if (duration < minimum || duration > rules.maximumDurationMinutes) timeError = `Trajanje mora biti od ${minimum} do ${rules.maximumDurationMinutes} minuta.`
    } catch (cause) { timeError = cause instanceof Error ? cause.message : 'Datum ili vreme nisu validni.' }
  }
  const durationMinutes = rules?.variableDuration ? timeError ? defaultDuration : duration : undefined
  const availability = useQuery({ queryKey: ['availability', 'customer-booking', serviceId, employeeChoice, date, resourceId, scopedLocationId, scopedAreaId, durationMinutes],
    queryFn: () => availabilityApi.overview({ serviceId, employeeId: employeeChoice === 'ANY' ? undefined : employeeChoice,
      resourceId: resourceId || undefined, locationId: scopedLocationId || undefined, areaId: scopedAreaId || undefined, durationMinutes, from: date, to: date }),
    enabled: Boolean(serviceId && rules && employeeValid && date && scopeReady && (!resourceId || selectedResource)),
    retry: false, refetchInterval: 15000, refetchIntervalInBackground: false })
  const slots = useMemo(() => {
    const unique = new Map<string, AvailabilitySlot>()
    availability.data?.employees.forEach(employee => employee.slots.forEach(slot => {
      const value = { ...slot, employeeId: employee.employeeId, employeeName: employee.employeeName }, previous = unique.get(slot.startTime)
      const rank = (item: AvailabilitySlot) => !item.status || item.status === 'AVAILABLE' ? 0 : item.status === 'UNAVAILABLE' ? 2 : 1
      if (!previous || rank(value) < rank(previous)) unique.set(slot.startTime, value)
    }))
    return [...unique.values()].sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [availability.data])
  useEffect(() => {
    if (!manualStart || timeError || availability.isFetching || availability.isError || blocked) return
    const match = slots.find(value => Date.parse(value.startTime) === Date.parse(manualStart))
    // Rebind a manually entered interval to the latest server availability before enabling submission.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSlot(match ?? null); setSelectedStart(match?.startTime ?? '')
  }, [manualStart, timeError, slots, availability.isFetching, availability.isError, blocked])
  // Polling rebinds the selection; a cached free slot cannot authorize creation.
  const chosenSlot = selectedSlot?.startTime === selectedStart ? slots.find(value => value.startTime === selectedStart
    && value.employeeId === selectedSlot.employeeId && value.resourceId === selectedSlot.resourceId) ?? null : null
  const occupied = Boolean(chosenSlot?.status?.startsWith('OCCUPIED_'))
  const resolvedResourceId = resourceId || chosenSlot?.resourceId || '', resolvedLocationId = chosenSlot?.locationId || selectedResource?.locationId || scopedLocationId
  const assigned = resources.find(value => value.id === resolvedResourceId), resolvedAreaId = assigned?.areaId || scopedAreaId
  const slotResources = useQuery({ queryKey: ['booking-resources', 'customer-interval', serviceId, selectedStart, chosenSlot?.endTime, scopedLocationId, scopedAreaId],
    queryFn: () => resourceApi.bookingOptions({ serviceId, start: selectedStart, end: chosenSlot!.endTime, locationId: scopedLocationId || undefined, areaId: scopedAreaId || undefined }),
    enabled: Boolean(serviceId && selectedStart && chosenSlot && !occupied && physicalStep), retry: false })
  const resourceUnavailable = Boolean(resolvedResourceId && slotResources.data && !slotResources.data.resources.some(value => value.id === resolvedResourceId && value.available))
  const recurrenceInput: RecurrenceInput = { serviceId, resourceId: resolvedResourceId || undefined, locationId: resolvedLocationId || undefined, areaId: resolvedAreaId || undefined,
    employeeId: employeeChoice, startTime: selectedStart, durationMinutes, note: note || undefined, frequency, interval: recurrenceInterval, occurrences, conflictPolicy }
  const previewInput = { ...recurrenceInput, note: undefined }
  const preview = useQuery({ queryKey: ['recurrence-preview', 'customer', previewInput], queryFn: () => reservationApi.previewRecurrence(previewInput),
    enabled: Boolean(recurring && selectedStart && scopeReady && !timeError && employeeValid && employeeChoice !== 'ANY'), retry: false,
    refetchInterval: 15000, refetchIntervalInBackground: false })
  const canSubmit = Boolean(!loading && !dataError && service && rules && employeeValid && scopeReady && !timeError && chosenSlot && (!occupied || recurring) && chosenSlot.status !== 'UNAVAILABLE'
    && !availability.isFetching && !availability.isError && !resourceOptions.isFetching && !resourceOptions.isError
    && (!physicalStep || resolvedResourceId && (recurring || !slotResources.isFetching && !slotResources.isError && !resourceUnavailable))
    && (!recurring || employeeChoice !== 'ANY' && preview.data && !preview.isFetching && !preview.isError && preview.data.occurrences.some(value => value.available)
      && (conflictPolicy !== 'ALL_OR_NOTHING' || preview.data.occurrences.every(value => value.available))))
  // Waitlist's existing contract uses the catalog duration, so verify that interval separately for custom-duration bookings.
  const needsStandardWaitlist = occupied && !recurring && Boolean(rules?.variableDuration && durationMinutes !== service?.durationMinutes)
  const waitlistAvailability = useQuery({ queryKey: ['availability', 'customer-waitlist-standard', serviceId, chosenSlot?.employeeId, selectedStart, resolvedResourceId, resolvedLocationId],
    queryFn: () => availabilityApi.overview({ serviceId, employeeId: chosenSlot!.employeeId, resourceId: resolvedResourceId || undefined,
      locationId: resolvedLocationId || undefined, from: date, to: date }), enabled: Boolean(needsStandardWaitlist && chosenSlot?.employeeId && date), retry: false })
  const standardSlot = needsStandardWaitlist ? waitlistAvailability.data?.employees.flatMap(value => value.slots).find(value => value.startTime === selectedStart) : chosenSlot
  const canJoin = Boolean(!loading && !dataError && service && rules && employeeValid && scopeReady && !timeError && occupied && !recurring
    && standardSlot?.status?.startsWith('OCCUPIED_') && !resourceOptions.isFetching && !resourceOptions.isError && !availability.isFetching && !availability.isError
    && (!needsStandardWaitlist || !waitlistAvailability.isFetching && !waitlistAvailability.isError))
  function resetSelection(clearTime = false) {
    setSelectedStart(''); setSelectedSlot(null); setError('')
    if (clearTime) { setFromTime(''); setToTime(''); setEndDate('') }
  }
  function choose(slot: AvailabilitySlot) {
    setSelectedStart(slot.startTime); setSelectedSlot(slot); setError('')
    if (rules?.variableDuration) { setFromTime(businessInstantToLocal(slot.startTime).slice(11)); setToTime(businessInstantToLocal(slot.endTime).slice(11)); setEndDate(businessInstantToLocal(slot.endTime).slice(0, 10)) }
  }
  async function create(event: FormEvent) {
    event.preventDefault()
    if ((!canSubmit && !frozen) || inFlight.current) return
    inFlight.current = true; setSubmitting(true); setError('')
    try {
      const base: CreateReservationInput = { serviceId, resourceId: resolvedResourceId || undefined, locationId: resolvedLocationId || undefined, areaId: resolvedAreaId || undefined,
        employeeId: employeeChoice === 'ANY' ? undefined : employeeChoice, startTime: selectedStart, durationMinutes, note: note || undefined }
      const request: ReservationCreationRequest = pending.current ?? (recurring ? { kind: 'RECURRING', input: { ...base, employeeId: employeeChoice, frequency, interval: recurrenceInterval, occurrences, conflictPolicy } } : { kind: 'SINGLE', input: base })
      pending.current = request
      let createdId: string | undefined
      if (request.kind === 'RECURRING') { const created = await reservationApi.createRecurrence(request.input, keys.begin()); setRecurrenceResult(created); createdId = created.created[0]?.id }
      else createdId = (await reservationApi.create(request.input, keys.begin())).id
      keys.succeeded(); pending.current = null
      toast(request.kind === 'RECURRING' ? 'Serija rezervacija je obrađena.' : 'Termin je rezervisan i čeka potvrdu.', 'success')
      await onCreated(request.kind === 'SINGLE' ? createdId : undefined)
    } catch (cause) {
      keys.failed(cause); if (!keys.pendingKey()) pending.current = null
      if (isConflictResponse(cause)) {
        if (!recurring) resetSelection()
        setError(recurring ? 'Dostupnost serije se promenila. Osvežite i proverite konflikte pre novog pokušaja.' : 'Termin je u međuvremenu zauzet. Izaberite ga ponovo ili se prijavite na listu čekanja.')
        if (recurring) await preview.refetch()
        await availability.refetch()
      } else setError(customerReservationError(cause, 'Termin nije moguće rezervisati. Pokušajte ponovo.'))
    } finally { inFlight.current = false; setSubmitting(false) }
  }
  async function joinWaitlist() {
    if (!canJoin || !chosenSlot?.employeeId || inFlight.current || blocked) return
    inFlight.current = true; setJoining(true); setError('')
    try {
      await waitlistApi.join({ serviceId, employeeId: chosenSlot.employeeId, resourceId: resolvedResourceId || undefined,
        locationId: resolvedLocationId || undefined, desiredStart: chosenSlot.startTime })
      toast('Dodati ste na listu čekanja za izabrani termin.', 'success'); await onWaitlisted()
    } catch (cause) { setError(customerReservationError(cause, 'Prijava na listu čekanja nije uspela.')); await availability.refetch() }
    finally { inFlight.current = false; setJoining(false) }
  }
  const footer = recurrenceResult ? <div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Zatvori</Button></div>
    : <div className="dialog-actions"><Button type="button" variant="secondary" disabled={blocked} onClick={onClose}>Otkaži</Button>
      {occupied && !recurring && !frozen ? <Button type="button" disabled={!canJoin || blocked} loading={joining} onClick={() => void joinWaitlist()}>Prijavi se na listu čekanja</Button>
        : <Button type="submit" form={id} loading={submitting} disabled={joining || !canSubmit && !frozen}>{frozen ? 'Ponovi isti zahtev' : recurring ? 'Kreiraj seriju' : 'Potvrdi termin'}</Button>}</div>
  return <Modal open title="Nova rezervacija" titleIcon={<CalendarClock />} className="gm-my-booking-dialog" closeDisabled={blocked} returnFocusRef={returnFocusRef} onClose={() => { if (!blocked) onClose() }} footer={footer}>
    {recurrenceResult ? <RecurrenceResultPanel result={recurrenceResult} locale="sr-Latn-RS" /> : <form id={id} className="gm-my-booking" onSubmit={create}>
      <p className="gm-my-booking-intro">Izaberite uslugu i termin. Dostupnost se proverava ponovo pri potvrđivanju.</p>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {frozen && <p className="gm-my-reservation-warning" role="status">Prethodni zahtev čeka konačan ishod. Ponovite isti zahtev sa istim podacima da biste dobili njegov rezultat.</p>}
      {loading ? <Skeleton lines={4} label="Učitavanje usluga i zaposlenih" /> : dataError ? <ErrorState message={customerReservationError(dataError, 'Podaci za zakazivanje nisu dostupni.')} action={<Button type="button" onClick={onReload}>Pokušaj ponovo</Button>} /> : null}
      <fieldset disabled={blocked || loading || Boolean(dataError)} className="gm-my-booking-fields">
        <section className="gm-my-booking-step"><h3><span>1</span>Usluga i prostor</h3><div className="gm-my-booking-grid">
          <label className="gm-my-full">Usluga<Select aria-label={"Usluga"} required value={serviceId} onChange={event => { const next = event.target.value; setServiceId(next); setResourceId(''); setLocationId(''); setAreaId(''); setEmployeeChoice('UNSELECTED'); setDate(''); setRecurring(false); resetSelection(true); onScopeChanged({ serviceId: next }) }}>
            <option value="">Izaberite uslugu</option>{serviceId && !service && <option value={serviceId} disabled>Izabrana usluga nije dostupna za rezervisanje</option>}
            {services.map(value => <option key={value.id} value={value.id}>{value.name} · {value.durationMinutes} min</option>)}</Select></label>
          {serviceId && resourceOptions.isLoading && <div className="gm-my-full"><Skeleton lines={2} label="Učitavanje resursa" /></div>}
          {resourceOptions.isError && <div className="gm-my-full"><ErrorState message={customerReservationError(resourceOptions.error, 'Resurse nije moguće učitati.')} action={<Button type="button" onClick={() => resourceOptions.refetch()}>Pokušaj ponovo</Button>} /></div>}
          {serviceId && physicalStep && <><label>Lokal<Select aria-label={"Lokal"} required={resourceRequired} value={scopedLocationId} onChange={event => { const next = event.target.value; setLocationId(next); setAreaId(''); setResourceId(''); resetSelection(); onScopeChanged({ serviceId, locationId: next }) }}>
            <option value="">Izaberite lokal</option>{locations.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</Select></label>
            <label>Zona<Select aria-label={"Zona"} required={resourceRequired} value={scopedAreaId} disabled={!scopedLocationId || blocked} onChange={event => { const next = event.target.value; setAreaId(next); setResourceId(''); resetSelection(); onScopeChanged({ serviceId, locationId: scopedLocationId, areaId: next }) }}>
              <option value="">Izaberite zonu</option>{areas.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</Select></label>
            <label className="gm-my-full">Računar / resurs<Select aria-label={"Računar / resurs"} value={resourceId} disabled={!scopeReady || blocked} onChange={event => { setResourceId(event.target.value); resetSelection(); onScopeChanged({ serviceId, locationId: scopedLocationId, areaId: scopedAreaId, resourceId: event.target.value }) }}>
              <option value="">Automatski izaberi slobodan kompatibilni resurs</option>{resourceId && !selectedResource && <option value={resourceId} disabled>Izabrani resurs više nije dostupan</option>}
              {resources.filter(value => value.locationId === scopedLocationId && value.areaId === scopedAreaId).map(value => <option key={value.id} value={value.id}>{value.code} · {value.name}</option>)}</Select></label>
            {!resourceOptions.isLoading && !resourceOptions.isError && !resources.length && <p className="gm-my-reservation-warning gm-my-full">Za ovu uslugu trenutno nema kompatibilnih resursa.</p>}</>}
        </div></section>
        {serviceId && <section className="gm-my-booking-step"><h3><span>2</span>Datum i vreme</h3><div className="gm-my-booking-grid">
          <label>Zaposleni<Select aria-label={"Zaposleni"} required value={employeeChoice} onChange={event => { setEmployeeChoice(event.target.value); setDate(''); setRecurring(false); resetSelection(true) }}><option value="UNSELECTED">Izaberite opciju</option><option value="ANY">Bilo koji slobodan zaposleni</option>
            {employeeChoice !== 'ANY' && employeeChoice !== 'UNSELECTED' && !employees.some(value => value.id === employeeChoice) && <option value={employeeChoice} disabled>Izabrani zaposleni nije dostupan</option>}
            {employees.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</Select></label>
          <label>Datum<Input aria-label={"Datum"} type="date" min={todayInBusinessZone()} required value={date} disabled={employeeChoice === 'UNSELECTED' || blocked} onChange={event => { setDate(event.target.value); resetSelection(true); setEndDate(event.target.value) }} /></label>
          {date && rules?.variableDuration && <><ReservationTimePicker label="Od" value={fromTime} disabled={blocked} onChange={value => { setFromTime(value); resetSelection() }} />
            <ReservationTimePicker label="Do" value={toTime} disabled={blocked} onChange={value => { setToTime(value); resetSelection() }} />
            <label>Datum završetka<Input aria-label={"Datum završetka"} type="date" min={date} required value={endDate || date} disabled={blocked} onChange={event => { setEndDate(event.target.value); resetSelection() }} /></label>
            <div className="gm-my-booking-duration"><span>Trajanje</span><strong>{!timeError ? customerDuration(duration) : '—'}</strong><small>{minimum}–{rules.maximumDurationMinutes} min</small></div>
            <p className="gm-my-booking-note gm-my-full">Izaberite ponuđeni početak ili unesite Od–Do. Proverava se ceo interval. Ručno uneto vreme mora biti dostupno u serverskom pregledu termina.</p>
            {timeError && <p className="error-banner gm-my-full" role="alert">{timeError}</p>}</>}
          {date && rules && !rules.variableDuration && <p className="gm-my-booking-note gm-my-full">Usluga ima fiksno trajanje od {rules.defaultDurationMinutes} minuta.</p>}
        </div></section>}
        {date && scopeReady && <section className="gm-my-booking-step"><h3><span>3</span>Slobodni i zauzeti termini</h3>
          <p className="gm-my-booking-note">Slobodan termin rezervišite uz potvrdu. Za zauzet termin možete se prijaviti na listu čekanja.</p>
          {availability.isLoading && <Skeleton lines={3} label="Provera dostupnosti termina" />}
          {availability.isError && <ErrorState message={customerReservationError(availability.error, 'Dostupne termine nije moguće učitati.')} action={<Button type="button" onClick={() => availability.refetch()}>Pokušaj ponovo</Button>} />}
          {!availability.isLoading && !availability.isError && !slots.some(value => value.status !== 'UNAVAILABLE') && <EmptyState title="Nema ponuđenih termina" description="Proverite razloge nedostupnosti ili izaberite drugi datum, zaposlenog ili resurs." />}
          {manualStart && !timeError && !availability.isFetching && !availability.isError && !chosenSlot && <p className="gm-my-reservation-warning">Za ručno unet početak nema ponuđenog termina. Izaberite početak iz serverskog pregleda.</p>}
          {!availability.isError && <div className="gm-my-booking-slots">{slots.filter(value => value.status !== 'UNAVAILABLE').map(slot => <label key={slot.startTime} className={`gm-my-booking-slot ${slot.status?.startsWith('OCCUPIED_') ? 'is-occupied' : ''}${selectedStart === slot.startTime ? ' is-selected' : ''}`}>
            <input type="radio" name={`${id}-slot`} checked={selectedStart === slot.startTime} disabled={blocked || availability.isFetching} onChange={() => choose(slot)} />
            <strong>{formatBusinessTime(slot.startTime)} – {formatBusinessIntervalEnd(slot.startTime, slot.endTime, 'sr-Latn-RS')}</strong><Badge tone={slot.status?.startsWith('OCCUPIED_') ? 'warning' : 'success'}>{slot.status?.startsWith('OCCUPIED_') ? 'Zauzet' : 'Slobodan'}</Badge>
            <small>{[slot.resourceCode, slot.resourceName, slot.locationName, employeeChoice === 'ANY' ? slot.employeeName : null].filter(Boolean).join(' · ')}</small>{slot.reason && <small>{bookingConflictReason(slot.reason)}</small>}
          </label>)}</div>}
          {!availability.isError && slots.some(value => value.status === 'UNAVAILABLE') && <details className="gm-my-unavailable"><summary>Nedostupni termini ({slots.filter(value => value.status === 'UNAVAILABLE').length})</summary><ul>{slots.filter(value => value.status === 'UNAVAILABLE').map(slot => <li key={slot.startTime}>{formatBusinessTime(slot.startTime)} · {bookingConflictReason(slot.reason)}</li>)}</ul></details>}
        </section>}
        {chosenSlot && (!occupied || recurring) && chosenSlot.status !== 'UNAVAILABLE' && <label>Napomena (opciono)<Textarea aria-label={"Napomena (opciono)"} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>}
        {chosenSlot && chosenSlot.status !== 'UNAVAILABLE' && employeeChoice !== 'ANY' && <details className="gm-my-booking-recurrence" open={recurring} onToggle={event => { if (!blocked) setRecurring(event.currentTarget.open) }}><summary onClick={event => { if (blocked) event.preventDefault() }}>Ponavljajući termin</summary>
          {recurring && <>
          <div className="gm-my-booking-grid"><label>Učestalost<Select aria-label={"Učestalost"} value={frequency} onChange={event => setFrequency(event.target.value as RecurrenceFrequency)}><option value="WEEKLY">Nedeljno</option><option value="MONTHLY">Mesečno</option></Select></label>
            <label>Interval<Input aria-label={"Interval"} type="number" required min={1} max={4} value={recurrenceInterval} onChange={event => setRecurrenceInterval(Number(event.target.value))} /></label>
            <label>Broj termina<Input aria-label={"Broj termina"} type="number" required min={2} max={20} value={occurrences} onChange={event => setOccurrences(Number(event.target.value))} /></label>
            <label>Politika konflikata<Select aria-label={"Politika konflikata"} value={conflictPolicy} onChange={event => setConflictPolicy(event.target.value as RecurrenceConflictPolicy)}><option value="ALL_OR_NOTHING">Sve ili nijedan termin</option><option value="SKIP_CONFLICTS">Preskoči konflikte</option></Select></label></div>
          {physicalStep && <p className="gm-my-booking-note">Za svaki termin serije posebno se proverava resurs u izabranom prostoru.</p>}
          <Button type="button" variant="secondary" loading={preview.isFetching} onClick={() => preview.refetch()}>Pregledaj ponavljanje</Button>
          {preview.isLoading && <Skeleton lines={3} label="Provera ponavljajućih termina" />}{preview.isError && <ErrorState message={customerReservationError(preview.error, 'Ponavljanje nije moguće pregledati.')} action={<Button type="button" onClick={() => preview.refetch()}>Pokušaj ponovo</Button>} />}
          {preview.data && <RecurrencePreviewPanel preview={preview.data} policy={conflictPolicy} locale="sr-Latn-RS" />}
          </>}
        </details>}
      </fieldset>
      {selectedStart && <section className="gm-my-booking-review"><h3>Proverite rezervaciju</h3><dl><div><dt>Usluga</dt><dd>{service?.name}</dd></div>
        <div><dt>Zaposleni</dt><dd>{employeeChoice === 'ANY' ? 'Bilo koji slobodan zaposleni' : employees.find(value => value.id === employeeChoice)?.name ?? chosenSlot?.employeeName}</dd></div>
        <div><dt>Lokal i zona</dt><dd>{chosenSlot?.locationName || selectedResource?.locationName || 'Lokal nije dodeljen'}{assigned?.areaName && ` · ${assigned.areaName}`}</dd></div>
        <div><dt>Računar / resurs</dt><dd>{resolvedResourceId ? [chosenSlot?.resourceCode || assigned?.code, chosenSlot?.resourceName || assigned?.name].filter(Boolean).join(' · ') : resourceRequired ? 'Resurs nije dodeljen' : 'Usluga ne zahteva resurs'}</dd></div>
        <div className="gm-my-full"><dt>Datum i vreme</dt><dd>{formatBusinessDateTime(selectedStart, false, 'sr-Latn-RS')}{chosenSlot && ` – ${formatBusinessIntervalEnd(selectedStart, chosenSlot.endTime, 'sr-Latn-RS')}`}</dd></div></dl>
        {!occupied && physicalStep && slotResources.isFetching && <p role="status">Provera dostupnosti resursa…</p>}
        {!occupied && slotResources.isError && <ErrorState message={customerReservationError(slotResources.error, 'Dostupnost resursa nije moguće proveriti.')} action={<Button type="button" onClick={() => slotResources.refetch()}>Pokušaj ponovo</Button>} />}
        {resourceUnavailable && !occupied && <p className="gm-my-reservation-warning">Resurs više nije dostupan za izabrani interval. Osvežite pregled termina.</p>}
        {occupied && !recurring && <><p className="gm-my-reservation-warning">{bookingConflictReason(chosenSlot?.reason)}</p>
          {needsStandardWaitlist && <p className="gm-my-booking-note">Lista čekanja koristi standardno trajanje ove usluge: {service?.durationMinutes} min. Proverava se dostupnost tog intervala pre prijave.</p>}
          {waitlistAvailability.isFetching && needsStandardWaitlist && <p role="status">Provera termina za listu čekanja…</p>}
          {waitlistAvailability.isError && needsStandardWaitlist && <ErrorState message={customerReservationError(waitlistAvailability.error, 'Termin za listu čekanja nije moguće proveriti.')} action={<Button type="button" onClick={() => waitlistAvailability.refetch()}>Pokušaj ponovo</Button>} />}
          {needsStandardWaitlist && !waitlistAvailability.isFetching && !waitlistAvailability.isError && !canJoin && <p className="gm-my-reservation-warning">Standardni interval nije ponuđen kao zauzet termin za listu čekanja. Izaberite drugi ponuđeni termin.</p>}</>}
        {!chosenSlot && <p className="gm-my-reservation-warning">Termin se promenio. Izaberite ga ponovo iz osveženog pregleda.</p>}
      </section>}
    </form>}
  </Modal>
}

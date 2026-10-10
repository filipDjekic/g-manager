import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { catalogApi } from '../api/catalogApi'
import { customerApi } from '../api/customerApi'
import { resourceApi } from '../api/resourceApi'
import { reservationApi } from '../api/reservationApi'
import { userApi } from '../api/userApi'
import { IdempotencyKeyManager } from '../api/idempotency'
import { useAuthStore } from '../auth/authStore'
import { Button, EmptyState, ErrorState, Modal, Skeleton } from '../components/ui'
import { CustomerPicker } from './CustomerPicker'
import { RecurrencePreviewPanel, RecurrenceResultPanel } from './RecurrencePreviewPanel'
import { ReservationIcon } from './ReservationIcon'
import { ReservationTimePicker, validTime } from './ReservationTimePicker'
import { bookingConflictReason, reservationApiErrorMessage as apiErrorMessage } from './bookingConflictReason'
import { businessInstantToLocal, businessLocalToInstant, formatBusinessDateTime as formatDateTime, formatBusinessIntervalEnd } from './dateTime'
import type { CatalogItem } from '../types/catalog.types'
import type { RecurrenceInput, RecurrenceFrequency, RecurrenceConflictPolicy, RecurrenceCreateResult, ReservationCreationRequest, ReservationBookingPlan } from '../types/reservation.types'
import './reservations.css'

type StaffReservationResult = {id: string; summary: string; recurrence: RecurrenceCreateResult | undefined}
type TimeRange = {date: string; from: string; to: string; endDate: string}
const formatBusinessDateTime = (value: string) => formatDateTime(value, false, 'sr-Latn-RS')
const intervalLabels = {AVAILABLE: 'Slobodno', OCCUPIED: 'Zauzeto', CLOSED: 'Van radnog vremena', UNAVAILABLE: 'Resurs nije dostupan'}
function localRange(start: string, end: string): TimeRange {
  const [date, from] = businessInstantToLocal(start).split('T'), [endDate, to] = businessInstantToLocal(end).split('T')
  return {date, from, to, endDate}
}
function durationLabel(minutes: number) {
  return [minutes >= 60 ? `${Math.floor(minutes / 60)}h` : '', minutes % 60 ? `${minutes % 60}min` : ''].filter(Boolean).join(' ') || '0min'
}
function addDays(date: string, days: number) {
  if (!date) return ''
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0,10)
}
async function activeServices() {
  const items = new Map<string,CatalogItem>()
  let page = 0, totalPages = 1
  do {
    const result = await catalogApi.list({page, size: 100, type: 'SERVICE', active: true, sort: 'name', direction: 'ASC'})
    result.content.forEach(item => items.set(item.id,item)); totalPages = result.totalPages; page++
  } while (page < totalPages)
  return [...items.values()].sort((first,second) => first.name.localeCompare(second.name,'sr-Latn-RS') || first.id.localeCompare(second.id))
}

export function StaffReservationForm({onClose,onCreated}:{onClose:()=>void;onCreated:(id:string,summary?:string)=>void}) {
  const actor = useAuthStore(state => state.user), client = useQueryClient(), formId = useId()
  const [customerId,setCustomerId] = useState(''), [customerName,setCustomerName] = useState('')
  const [serviceId,setServiceId] = useState(''), [employeeId,setEmployeeId] = useState(actor?.role === 'EMPLOYEE' ? actor.id : '')
  const [locationId,setLocationId] = useState(''), [areaId,setAreaId] = useState(''), [resourceId,setResourceId] = useState('')
  const [range,setRange] = useState<TimeRange>(() => {
    const future = businessInstantToLocal(new Date((Math.floor(Date.now()/900000) + 1)*900000).toISOString())
    const [date, from] = future.split('T'); return {date, from, to: '', endDate: date}
  })
  const [note,setNote] = useState(''), [review,setReview] = useState(false), [repeat,setRepeat] = useState(false)
  const [frequency,setFrequency] = useState<RecurrenceFrequency>('WEEKLY'), [interval,setInterval] = useState(1), [occurrences,setOccurrences] = useState(4)
  const [conflictPolicy,setConflictPolicy] = useState<RecurrenceConflictPolicy>('ALL_OR_NOTHING')
  const [seriesResult,setSeriesResult] = useState<RecurrenceCreateResult | null>(null)
  const keys = useRef(new IdempotencyKeyManager()), pending = useRef<ReservationCreationRequest | null>(null), submitting = useRef(false)
  const initializedService = useRef(''), timeTouched = useRef(false), adjusted = useRef(false)
  const services = useQuery({queryKey: ['catalog','reservation-services','all-active'], queryFn: activeServices})
  const service = services.data?.find(item => item.id === serviceId)
  const customer = useQuery({queryKey: ['customers','reservation-selected',customerId],queryFn: () => customerApi.detail(customerId),enabled: !!customerId,refetchInterval: 15000})
  const employees = useQuery({queryKey: ['users','reservation-employees'],queryFn: userApi.employees})
  const locations = useQuery({queryKey: ['resources','locations'],queryFn: resourceApi.locations})
  const areas = useQuery({queryKey: ['resources','areas',locationId],queryFn: () => resourceApi.areas(locationId),enabled: !!locationId})
  const scope = useQuery({queryKey: ['resource-management-scope'],queryFn: resourceApi.managementScope,refetchInterval: 15000})
  const settings = useQuery({queryKey: ['staff-booking-rules',actor?.id,serviceId],
    queryFn: () => resourceApi.bookingOptions({serviceId,managedOnly: true}),enabled: !!serviceId,refetchInterval: 15000})
  const rules = settings.error ? undefined : settings.data
  const needsResource = !!rules?.resourceRequired || actor?.role === 'EMPLOYEE'
  let start = '', end = '', inputError = '', duration = 0
  try {
    if (range.date && validTime(range.from)) start = businessLocalToInstant(`${range.date}T${range.from}`)
    if (!start || !range.endDate || !validTime(range.to)) inputError = 'Izaberite datum i unesite oba vremena u formatu HH:mm.'
    else {
      end = businessLocalToInstant(`${range.endDate}T${range.to}`)
      duration = (Date.parse(end) - Date.parse(start))/60000
      if (!Number.isInteger(duration) || duration <= 0) inputError = 'Vreme završetka mora biti posle početka. Za termin preko ponoći promenite datum završetka.'
      else if (Date.parse(start) <= Date.now()) inputError = 'Rezervacija mora početi u budućnosti.'
    }
  } catch (error) {inputError = error instanceof Error ? error.message : 'Datum ili vreme nisu validni.'}
  if (!inputError && rules && (duration < rules.minimumDurationMinutes || duration > rules.maximumDurationMinutes))
    inputError = rules.variableDuration ? `Trajanje mora biti od ${rules.minimumDurationMinutes} do ${rules.maximumDurationMinutes} minuta.` : `Usluga ima fiksno trajanje od ${rules.defaultDurationMinutes} minuta.`
  const optionStart = !inputError ? start : undefined, optionEnd = !inputError ? end : undefined
  const options = useQuery({queryKey: ['staff-booking-options',actor?.id,serviceId,locationId,areaId,optionStart,optionEnd],
    queryFn: () => resourceApi.bookingOptions({serviceId,locationId: locationId || undefined,areaId: areaId || undefined,
      start: optionStart,end: optionEnd,managedOnly: true}),enabled: !!serviceId,refetchInterval: 15000})
  const compatible = options.error ? [] : options.data?.resources ?? []
  const resource = resourceId ? compatible.find(item => item.id === resourceId && item.locationId === locationId && item.areaId === areaId) : undefined
  useEffect(() => {
    if (!rules || !serviceId || !validTime(range.from) || !range.date || keys.current.pendingKey() || submitting.current) return
    if (rules.variableDuration && initializedService.current === serviceId) return
    try {
      const begin = businessLocalToInstant(`${range.date}T${range.from}`)
      const initial = rules.variableDuration ? Math.min(rules.maximumDurationMinutes,Math.max(rules.minimumDurationMinutes,rules.defaultDurationMinutes)) : rules.defaultDurationMinutes
      const next = localRange(begin,new Date(Date.parse(begin) + initial*60000).toISOString())
      initializedService.current = serviceId
      setRange(current => current.to === next.to && current.endDate === next.endDate ? current : {...current,to: next.to,endDate: next.endDate})
    } catch { /* incomplete or nonexistent local time */ }
  }, [serviceId,rules,range.from,range.date])
  const validScope = !needsResource || !!locationId && !!areaId
  const validResource = !resourceId || !!resource
  const planParams = {serviceId,employeeId: employeeId || undefined,resourceId: resourceId || undefined,locationId: locationId || undefined,
    areaId: areaId || undefined,date: range.date,start: !inputError ? start : undefined,durationMinutes: !inputError ? duration : undefined}
  const plan = useQuery({queryKey: ['staff-booking-plan',actor?.id,planParams],queryFn: () => reservationApi.bookingPlan(planParams),
    enabled: !!rules && !!range.date && validScope && validResource,refetchInterval: 15000,retry: false})
  const applyAlternative = (alternative: ReservationBookingPlan['alternatives'][number]) => {
    timeTouched.current = true; setRange(localRange(alternative.startTime,alternative.endTime))
  }
  useEffect(() => {
    if (!plan.data || plan.error || plan.isFetching || plan.data.available || !plan.data.alternatives.length || inputError
      || timeTouched.current || adjusted.current || keys.current.pendingKey() || submitting.current || repeat || review) return
    adjusted.current = true; setRange(localRange(plan.data.alternatives[0].startTime,plan.data.alternatives[0].endTime))
  }, [plan.data,plan.error,plan.isFetching,inputError,repeat,review])
  const recurrenceInput: RecurrenceInput = {customerId,serviceId,employeeId,resourceId: resourceId || undefined,locationId: locationId || undefined,
    areaId: areaId || undefined,durationMinutes: duration,startTime: start,note: note || undefined,frequency,interval,occurrences,conflictPolicy}
  const preview = useQuery({queryKey: ['staff-recurrence-preview',JSON.stringify(recurrenceInput)],queryFn: () => reservationApi.previewRecurrence(recurrenceInput),
    enabled: repeat && !!employeeId && !!customerId && !!service && !!rules && !inputError && validScope && validResource,retry: false,refetchInterval: 15000})
  const frozen = !!keys.current.pendingKey()
  const create = useMutation<StaffReservationResult,Error,void>({mutationFn: () => {
    const request: ReservationCreationRequest = pending.current ?? (repeat ? {kind: 'RECURRING',input: recurrenceInput}
      : {kind: 'SINGLE',input: {customerId,serviceId,employeeId: employeeId || undefined,resourceId: resourceId || undefined,
        locationId: locationId || undefined,areaId: areaId || undefined,durationMinutes: duration,startTime: start,note: note || undefined}})
    pending.current = request
    if (request.kind === 'RECURRING') return reservationApi.createRecurrence(request.input,keys.current.begin()).then(result => ({id: result.created[0].id,
      summary: `Kreirano ${result.created.length}, preskočeno ${result.skipped.length} termina.`,recurrence: result}))
    return reservationApi.create(request.input,keys.current.begin()).then(value => ({id: value.id,summary: 'Rezervacija je kreirana.',recurrence: undefined}))
  },onSuccess: async value => {
    keys.current.succeeded(); pending.current = null
    await Promise.all([client.invalidateQueries({queryKey: ['reservations']}),client.invalidateQueries({queryKey: ['staff-booking-plan']}),client.invalidateQueries({queryKey: ['staff-booking-options']})])
    if (value.recurrence) setSeriesResult(value.recurrence); else onCreated(value.id,value.summary)
  },onError: async error => {
    keys.current.failed(error); if (!keys.current.pendingKey()) pending.current = null
    await Promise.all([options.refetch(),settings.refetch(),scope.refetch(),plan.refetch()])
  },onSettled: () => {submitting.current = false}})
  const permitted = scope.data?.allResources || (repeat ? (conflictPolicy === 'ALL_OR_NOTHING'
    ? preview.data?.occurrences.every(item => item.available && !!item.resourceId && scope.data?.resourceIds.includes(item.resourceId))
    : preview.data?.occurrences.some(item => item.available && !!item.resourceId && scope.data?.resourceIds.includes(item.resourceId)))
    : !!plan.data?.resourceId && scope.data?.resourceIds.includes(plan.data.resourceId))
  const eligible = !!customer.data?.customer.active && !customer.error && !customer.isFetching && !!service && !!rules && !inputError
    && validScope && validResource && !options.isFetching && !options.error && !settings.error && !scope.error && !scope.isLoading && !!permitted
    && (repeat ? !!employeeId && !preview.isFetching && !preview.error && !!preview.data
      && (conflictPolicy === 'ALL_OR_NOTHING' ? preview.data.occurrences.every(item => item.available) : preview.data.occurrences.some(item => item.available))
      : !plan.isFetching && !plan.error && !!plan.data?.available)
  const blocked = create.isPending || frozen
  const minimum = rules?.minimumDurationMinutes ?? 30
  const nearestEnd = start ? new Date(Date.parse(start) + minimum*60000).toISOString() : ''
  const today = businessInstantToLocal(new Date().toISOString()).split('T')[0]
  const areaName = areas.data?.find(item => item.id === areaId)?.name
  const activeLocation = locations.data?.some(item => item.id === locationId && item.active)
  const activeArea = areas.data?.some(item => item.id === areaId && item.active && item.locationId === locationId)
  const canSubmit = eligible && (!needsResource || !!activeLocation && !!activeArea)
  return <Modal open closeDisabled={blocked} title="Nova rezervacija" titleIcon={<ReservationIcon />} className="reservation-create-dialog"
    onClose={() => {if (!blocked) onClose()}} footer={<div className="dialog-actions reservation-create-actions">
      {seriesResult ? <><Button variant="secondary" type="button" onClick={onClose}>Zatvori</Button>
        <Button type="button" onClick={() => onCreated(seriesResult.created[0].id,`Kreirano ${seriesResult.created.length}, preskočeno ${seriesResult.skipped.length} termina.`)}>Otvori kreiranu rezervaciju</Button></>
        : <><Button type="button" variant="secondary" disabled={blocked} onClick={onClose}>Otkaži</Button>
          {review && !blocked && <Button type="button" variant="secondary" onClick={() => setReview(false)}>Izmeni podatke</Button>}
          <Button type="submit" form={formId} loading={create.isPending} disabled={!canSubmit && !frozen}>{review ? 'Kreiraj rezervaciju' : 'Pregled rezervacije'}</Button></>}
    </div>}>
    {seriesResult ? <RecurrenceResultPanel result={seriesResult} locale="sr-Latn-RS" /> : <>
      <p className="reservation-create-intro">{review ? 'Proverite podatke i dostupnost pre konačnog kreiranja.' : 'Izaberite klijenta, uslugu, lokal i termin.'}</p>
      {create.error && <ErrorState message={apiErrorMessage(create.error,'Rezervaciju nije moguće kreirati.')} />}
      {scope.error && <ErrorState message="Dodele stanica nisu dostupne." action={<Button type="button" onClick={() => scope.refetch()}>Pokušaj ponovo</Button>} />}
      {!scope.isLoading && !scope.error && !scope.data?.allResources && !scope.data?.resourceIds.length && <EmptyState title="Nemate dodeljene stanice" description="Administrator treba da vam dodeli stanicu pre kreiranja rezervacije." />}
      <form id={formId} className="form-grid reservation-editor reservation-create-form" onSubmit={event => {
        event.preventDefault(); if (submitting.current || create.isPending) return
        if (canSubmit || frozen) {if (review) {submitting.current = true; create.mutate()} else setReview(true)}
      }}>
        {!review ? <>
          <CustomerPicker value={customerId} required disabled={blocked} onChange={(id,name) => {setCustomerId(id);setCustomerName(name ?? '')}} />
          <label>Usluga<select required disabled={blocked || services.isLoading || !!services.error} value={serviceId} onChange={event => {
            initializedService.current = ''; adjusted.current = false;setServiceId(event.target.value);setResourceId('')
          }}><option value="">Izaberite uslugu</option>{services.data?.map(item => <option key={item.id} value={item.id}>{item.name}{item.durationMinutes ? ` · ${item.durationMinutes} min` : ''}</option>)}</select></label>
          {services.error && <ErrorState message="Usluge nisu dostupne." action={<Button type="button" onClick={() => services.refetch()}>Pokušaj ponovo</Button>} />}
          <label>Zaposleni<select disabled={blocked || employees.isLoading || !!employees.error} value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
            <option value="">Automatski slobodan zaposleni</option>{employees.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {employees.error && <ErrorState message="Zaposleni nisu dostupni." action={<Button type="button" onClick={() => employees.refetch()}>Pokušaj ponovo</Button>} />}
          <label>Lokal<select required={needsResource} disabled={blocked || locations.isLoading || !!locations.error} value={locationId}
            onChange={event => {setLocationId(event.target.value);setAreaId('');setResourceId('')}}><option value="">{needsResource ? 'Izaberite lokal' : 'Bez određenog lokala'}</option>
            {locations.data?.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Zona<select required={needsResource} disabled={blocked || !locationId || areas.isFetching || !!areas.error} value={areaId}
            onChange={event => {setAreaId(event.target.value);setResourceId('')}}><option value="">{needsResource ? 'Izaberite zonu' : 'Bez određene zone'}</option>
            {areas.data?.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {(locations.error || areas.error) && <ErrorState message="Lokal ili zone nije moguće učitati." action={<Button type="button" onClick={() => {void locations.refetch(); if(locationId) void areas.refetch()}}>Pokušaj ponovo</Button>} />}
          <label className="reservation-form-wide">Gaming računar / PlayStation / drugi resurs<select disabled={blocked || !service || options.isFetching || !validScope || !!options.error}
            value={resourceId} onChange={event => setResourceId(event.target.value)}><option value="">{needsResource ? 'Automatski dodeli slobodan resurs u izabranoj zoni' : 'Bez fizičkog resursa'}</option>
            {compatible.map(item => <option key={item.id} value={item.id} disabled={item.unavailabilityReason === 'Resource or location is inactive or not bookable'
              || item.unavailabilityReason === 'Station is unavailable for booking'}>{item.code} · {item.name} · {item.available ? 'Dostupno' : bookingConflictReason(item.unavailabilityReason)}</option>)}</select></label>
          {(options.error || settings.error) && <ErrorState message={apiErrorMessage(options.error || settings.error,'Resurse i pravila trajanja nije moguće učitati.')} action={<Button type="button" onClick={() => {void options.refetch();void settings.refetch()}}>Pokušaj ponovo</Button>} />}
          {rules && needsResource && validScope && !options.isFetching && !compatible.length && <p className="warning-banner">U izabranoj zoni nema kompatibilnih resursa kojima možete upravljati.</p>}
          {resource && !resource.available && <p className="warning-banner">{bookingConflictReason(resource.unavailabilityReason)}</p>}
          <section className="reservation-interval-fields" aria-label="Datum i vremenski interval">
            <label>Datum rezervacije<input type="date" required min={today} disabled={blocked} value={range.date}
              onClick={event => {try {event.currentTarget.showPicker?.()} catch { /* native keyboard fallback */ }}}
              onChange={event => {timeTouched.current = true;const date = event.target.value;setRange(current => ({...current,date,endDate: current.endDate === current.date ? date : addDays(date,1)}))}} /></label>
            <label>Datum završetka<input type="date" required min={range.date || today} disabled={blocked || !rules?.variableDuration} value={range.endDate}
              onChange={event => {timeTouched.current = true;setRange(current => ({...current,endDate: event.target.value}))}} /></label>
            <ReservationTimePicker label="Od" value={range.from} disabled={blocked || !service} onChange={from => {timeTouched.current = true;setRange(current => ({...current,from}))}} />
            <ReservationTimePicker label="Do" value={range.to} disabled={blocked || !rules?.variableDuration} onChange={to => {timeTouched.current = true;setRange(current => ({...current,to}))}} />
            {rules && <p className="search-help reservation-form-wide">{rules.variableDuration ? `Gaming termin: ${rules.minimumDurationMinutes}–${rules.maximumDurationMinutes} min. Sat nudi korake od 15 minuta; moguć je i ručni unos.` : `Ova usluga ima fiksno trajanje od ${rules.defaultDurationMinutes} minuta.`} Poslovna zona: Europe/Belgrade.</p>}
          </section>
          {inputError && service && <div className="warning-banner reservation-form-wide" role="alert"><p>{inputError}</p>
            {nearestEnd && (duration < minimum || !validTime(range.to)) && <Button type="button" variant="secondary" disabled={blocked}
              onClick={() => {timeTouched.current = true;setRange(localRange(start,nearestEnd))}}>Postavi kraj na {formatBusinessDateTime(nearestEnd)}</Button>}</div>}
          {!inputError && <div className="reservation-duration-note" aria-live="polite"><span>Od {range.from} do {range.to}<strong>Ukupno: {durationLabel(duration)}</strong></span>
            <span>Datum završetka<strong>{formatBusinessDateTime(end)}</strong></span></div>}
          <section className="reservation-booking-availability" aria-label="Dostupnost celog intervala">
            {!validScope ? <p>Izaberite lokal i zonu za proveru dostupnosti.</p> : !validResource ? <p className="warning-banner">Izabrani resurs nije u izabranom lokalu i zoni.</p>
              : plan.isFetching ? <p role="status">Provera dostupnosti celog intervala…</p>
                : plan.error ? <ErrorState message={apiErrorMessage(plan.error,'Dostupnost nije moguće proveriti.')} action={<Button type="button" onClick={() => plan.refetch()}>Pokušaj ponovo</Button>} />
                  : !inputError && plan.data && <p role="status" className={plan.data.available ? 'reservation-interval-available' : 'warning-banner'}>{plan.data.available ? 'Izabrani period je dostupan. Pre čuvanja će biti ponovo proveren.' : bookingConflictReason(plan.data.reason)}</p>}
            {!inputError && !plan.error && !plan.isFetching && plan.data && !plan.data.available && plan.data.alternatives.length > 0 && <div className="reservation-alternatives"><span>Dostupne alternative za isto trajanje:</span>
              {plan.data.alternatives.map(item => <Button key={item.startTime} type="button" variant="secondary" disabled={blocked} onClick={() => applyAlternative(item)}>{formatBusinessDateTime(item.startTime)} – {formatBusinessIntervalEnd(item.startTime,item.endTime,'sr-Latn-RS')}</Button>)}</div>}
          </section>
          {resourceId && range.date && plan.data && !plan.error && <section className="reservation-day-schedule" aria-label="Zauzetost resursa za izabrani dan">
            <h3>Zauzetost resursa za izabrani dan</h3><p>Stvarni intervali rezervacija i aktivnih sesija. Poslednja provera: {formatBusinessDateTime(plan.data.serverTime)}.</p>
            <ol>{plan.data.intervals.map(item => <li key={item.startTime} className={`reservation-day-interval reservation-day-interval--${item.status.toLowerCase()}`}>
              <span>{intervalLabels[item.status]}</span><time dateTime={item.startTime}>{formatBusinessDateTime(item.startTime)} – {formatBusinessDateTime(item.endTime)}</time></li>)}</ol>
          </section>}
          <fieldset className="reservation-repeat-fields"><legend>Ponavljanje termina</legend>
            <label className="checkbox-field"><input type="checkbox" disabled={blocked} checked={repeat} onChange={event => setRepeat(event.target.checked)} /> Ponavljajuća rezervacija</label>
            {repeat && <><p className="search-help">Izaberite zaposlenog. Automatska dodela ostaje ograničena na izabranu zonu za sve termine.</p>
              <label>Učestalost<select disabled={blocked} value={frequency} onChange={event => setFrequency(event.target.value as RecurrenceFrequency)}><option value="WEEKLY">Nedeljno</option><option value="MONTHLY">Mesečno</option></select></label>
              <label>Interval<input type="number" min={1} max={4} required disabled={blocked} value={interval} onChange={event => setInterval(Number(event.target.value))} /></label>
              <label>Broj termina<input type="number" min={2} max={20} required disabled={blocked} value={occurrences} onChange={event => setOccurrences(Number(event.target.value))} /></label>
              <label>Konflikti<select disabled={blocked} value={conflictPolicy} onChange={event => setConflictPolicy(event.target.value as RecurrenceConflictPolicy)}><option value="ALL_OR_NOTHING">Kreiraj samo ako su svi termini slobodni</option><option value="SKIP_CONFLICTS">Preskoči zauzete termine</option></select></label></>}
          </fieldset>
          <label className="reservation-form-wide">Napomena<textarea rows={3} maxLength={500} disabled={blocked} value={note} onChange={event => setNote(event.target.value)} /></label>
        </> : <section className="panel reservation-review"><h3>Pregled pre kreiranja</h3>
          <p><strong>Klijent:</strong>{customer.data?.customer.name ?? customerName}</p><p><strong>Usluga:</strong>{service?.name}</p>
          <p><strong>Zaposleni:</strong>{employees.data?.find(item => item.id === employeeId)?.name ?? 'Automatski slobodan zaposleni'}</p>
          <p><strong>Lokal:</strong>{locations.data?.find(item => item.id === locationId)?.name ?? 'Bez određenog lokala'}</p><p><strong>Zona:</strong>{areaName ?? 'Bez određene zone'}</p>
          <p><strong>Računar / resurs:</strong>{resource ? `${resource.code} · ${resource.name}` : needsResource ? 'Automatska dodela slobodnog resursa u izabranoj zoni' : 'Bez fizičkog resursa'}</p>
          <p><strong>Početak:</strong>{start && formatBusinessDateTime(start)}</p><p><strong>Kraj:</strong>{end && formatBusinessDateTime(end)}</p>
          <p><strong>Ukupno trajanje:</strong>{durationLabel(duration)}</p>{note && <p><strong>Napomena:</strong>{note}</p>}
          {frozen && <p role="status">Prethodni zahtev čeka konačan ishod. Ponovite isti zahtev; podaci i Idempotency-Key su sačuvani.</p>}
          {!frozen && !canSubmit && <p className="warning-banner" role="alert">Dostupnost ili pravo rezervisanja se promenilo. Sačekajte proveru ili izmenite podatke.</p>}
        </section>}
        {repeat && <section aria-label="Dostupnost ponavljajućih termina">{preview.isFetching ? <Skeleton lines={3} /> : preview.error ? <ErrorState message={apiErrorMessage(preview.error,'Pregled serije nije dostupan.')}
          action={<Button type="button" onClick={() => preview.refetch()}>Pokušaj ponovo</Button>} /> : preview.data ? <RecurrencePreviewPanel preview={preview.data} policy={conflictPolicy} locale="sr-Latn-RS" /> : <p>Unesite klijenta, uslugu, zaposlenog, zonu i vremenski interval za pregled serije.</p>}</section>}
      </form>
    </>}
  </Modal>
}

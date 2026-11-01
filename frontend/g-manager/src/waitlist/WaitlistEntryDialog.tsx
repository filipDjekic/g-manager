import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Link } from 'react-router-dom'
import { waitlistApi } from '../api/waitlistApi'
import { resourceApi } from '../api/resourceApi'
import { availabilityApi } from '../api/availabilityApi'
import { customerApi } from '../api/customerApi'
import { IdempotencyKeyManager } from '../api/idempotency'
import { useAuthStore } from '../auth/authStore'
import { Button, ErrorState, FormField, Input, Modal, Select, Textarea, Alert } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { CustomerPicker } from '../reservations/CustomerPicker'
import { businessInstantToLocal, businessLocalToInstant, formatBusinessTime, todayInBusinessZone } from '../reservations/dateTime'
import { useServerNow } from '../gaming/useServerNow'
import type { ManageWaitlistInput, WaitlistDetail, WaitlistOperationalEntry } from '../types/waitlist.types'
import { WaitlistIcon } from './waitlistPresentation'
import { waitlistEmployees, waitlistError, waitlistServices } from './waitlistPresentation.model'

export function WaitlistEntryDialog({ entry, serverTime, returnFocusRef, onClose, onSaved, onConflict }: {
  entry?: WaitlistOperationalEntry; serverTime?: string; returnFocusRef: RefObject<HTMLElement | null>
  onClose: () => void; onSaved: (value: WaitlistDetail) => Promise<void>; onConflict: () => Promise<void>
}) {
  const actor = useAuthStore(state => state.user), id = useId(), first = useRef<HTMLSelectElement>(null)
  const initialTime = entry ? businessInstantToLocal(entry.desiredStart) : ''
  const initial = { customerId: entry?.customerId ?? '', serviceId: entry?.serviceId ?? '', employeeId: entry?.employeeId ?? (actor?.role === 'EMPLOYEE' ? actor.id : ''),
    locationId: entry?.locationId ?? '', areaId: entry?.areaId ?? '', resourceId: entry?.resourceId ?? '',
    date: initialTime.slice(0, 10), time: initialTime.slice(11, 16), note: entry?.internalNote ?? '', consent: false }
  const [form, setForm] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false)
  const keys = useRef(new IdempotencyKeyManager()), pending = useRef<ManageWaitlistInput | null>(null), submitting = useRef(false)
  const dirty = JSON.stringify(initial) !== JSON.stringify(form) || uncertain
  const releaseNavigation = useDirtyGuard(dirty || busy, { pending: busy || uncertain })
  const { confirm, confirmationDialog } = useConfirmDialog()
  const change = (values: Partial<typeof form>) => { if (!busy && !uncertain) { setForm(old => ({ ...old, ...values })); setError('') } }
  const close = () => {
    if (busy || uncertain) return
    if (!dirty) onClose()
    else confirm({ title: 'Odbaci izmene?', description: 'Uneti podaci nisu sačuvani.', confirmLabel: 'Odbaci izmene', className: 'gm-waitlist-dialog', onConfirm: onClose })
  }
  const services = useQuery({ queryKey: ['catalog', 'waitlist-services'], queryFn: waitlistServices })
  const employees = useQuery({ queryKey: ['users', 'waitlist-employees'], queryFn: waitlistEmployees })
  const locations = useQuery({ queryKey: ['resources', 'locations'], queryFn: resourceApi.locations })
  const scope = useQuery({ queryKey: ['waitlist', 'management-scope', actor?.id], queryFn: waitlistApi.managementScope, refetchInterval: 15000 })
  const areas = useQuery({ queryKey: ['resources', 'areas', form.locationId], queryFn: () => resourceApi.areas(form.locationId), enabled: !!form.locationId })
  const resources = useQuery({ queryKey: ['resources', 'waitlist-options', form.serviceId], queryFn: () => resourceApi.catalogResources(form.serviceId), enabled: !!form.serviceId, refetchInterval: 15000 })
  const customer = useQuery({ queryKey: ['customers', 'reservation-selected', form.customerId], queryFn: () => customerApi.detail(form.customerId), enabled: !!form.customerId, refetchInterval: 15000 })
  const service = services.data?.find(item => item.id === form.serviceId)
  const all = scope.data?.allResources ?? false
  const candidates = (resources.data ?? []).filter(item => (!form.locationId || item.locationId === form.locationId) && (!form.areaId || item.areaId === form.areaId))
  const permitted = candidates.filter(item => all || scope.data?.resourceIds.includes(item.id))
  const flexible = all || Boolean(form.locationId && form.employeeId === actor?.id && scope.data?.locationIds.includes(form.locationId)
    && candidates.every(item => scope.data?.resourceIds.includes(item.id)))
  let start = '', end = '', timeError = ''
  try {
    if (form.date && form.time) {
      start = businessLocalToInstant(`${form.date}T${form.time}`)
      if (service?.durationMinutes) end = new Date(Date.parse(start) + service.durationMinutes * 60000).toISOString()
    }
  } catch (cause) { timeError = waitlistError(cause) }
  const availability = useQuery({ queryKey: ['waitlist', 'availability', form.serviceId, form.employeeId, form.locationId, form.areaId, form.resourceId, form.date],
    queryFn: () => availabilityApi.overview({ serviceId: form.serviceId, employeeId: form.employeeId, locationId: form.locationId || undefined,
      areaId: form.areaId || undefined, resourceId: form.resourceId || undefined, from: form.date, to: form.date }),
    enabled: !!start && !!service && !!form.employeeId && !timeError, refetchInterval: 15000, retry: false })
  const now = useServerNow(availability.data?.serverTime ?? serverTime)
  const slot = availability.data?.employees.find(item => item.employeeId === form.employeeId)?.slots.find(item => Date.parse(item.startTime) === Date.parse(start))
  const free = slot?.status === 'AVAILABLE' || error.includes('termin je slobodan')
  const selectedLocation = locations.data?.find(item => item.id === form.locationId)
  const selectedArea = areas.data?.find(item => item.id === form.areaId)
  const directReservation = '/reservations?' + new URLSearchParams({ create: '1', customerId: form.customerId,
    ...(form.resourceId ? { resourceId: form.resourceId } : {}), ...(form.locationId ? { locationId: form.locationId } : {}) })
  const blocked = busy || uncertain
  const requiredDataLoading = services.isLoading || employees.isLoading || locations.isLoading || scope.isLoading
  const requiredDataError = services.error || employees.error || locations.error || scope.error
  const sourceChanged = entry && conflict
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || sourceChanged) return
    setError('')
    const input = pending.current ?? {
      customerId: form.customerId, serviceId: form.serviceId, employeeId: form.employeeId,
      locationId: form.locationId || undefined, areaId: form.areaId || undefined, resourceId: form.resourceId || undefined,
      desiredStart: start, internalNote: form.note.trim() || undefined, customerConsent: form.consent, version: entry?.version,
    }
    if (!pending.current) {
      const selectedEmployee = employees.data?.find(item => item.id === form.employeeId && item.active)
      if (!customer.data?.customer.active || !service?.active || !selectedEmployee || !start || !end || timeError || Date.parse(start) <= now) {
        setError(timeError || 'Izaberite aktivnog klijenta, uslugu, zaposlenog i budući termin.'); return
      }
      if (!entry && !form.consent) { setError('Potvrdite saglasnost klijenta za prijavu.'); return }
      if (requiredDataError || requiredDataLoading || resources.error || areas.error || !scope.data) { setError('Sačekajte učitavanje i proveru svih izbora.'); return }
      if (form.locationId && !selectedLocation?.active || form.areaId && !selectedArea?.active) { setError('Izaberite aktivan lokal i zonu.'); return }
      if (form.resourceId && !permitted.some(item => item.id === form.resourceId && item.available) || !form.resourceId && !flexible) {
        setError('Izaberite odgovarajući resurs u svom opsegu.'); return
      }
      if (free) { setError('Izabrani termin je slobodan. Možete napraviti direktnu rezervaciju.'); return }
      if (slot?.status === 'UNAVAILABLE') { setError('Izabrani termin nije dostupan za ovu uslugu ili zaposlenog.'); return }
      pending.current = input
    }
    submitting.current = true; setBusy(true)
    try {
      const value = entry ? await waitlistApi.updateManaged(entry.id, input) : await waitlistApi.createManaged(input, keys.current.begin())
      pending.current = null; keys.current.succeeded(); setUncertain(false)
      releaseNavigation(); await onSaved(value)
    } catch (cause) {
      keys.current.failed(cause)
      const unknown = isAxiosError(cause) && (!cause.response || cause.response.status === 425 || cause.response.status >= 500
        || uncertain && [401,403].includes(cause.response.status) || cause.response.status===409 && /idempotency[- ]?key/i.test(String(cause.response.data?.message??'')))
      setUncertain(unknown)
      if (!unknown) { keys.current.failed(cause); pending.current = null }
      setError(unknown ? 'Ishod zahteva nije potvrđen. Ponovite isti zahtev; podaci su zaključani dok se ishod ne razjasni.' : waitlistError(cause))
      if (isAxiosError(cause) && cause.response?.status === 409) { setConflict(Boolean(entry)); await onConflict() }
    } finally { submitting.current = false; setBusy(false) }
  }
  return <>
    <Modal size="wide" open title={entry ? 'Izmeni prijavu' : 'Dodaj na listu čekanja'} titleIcon={<WaitlistIcon kind={entry ? 'edit' : 'plus'} />}
      className="gm-waitlist-dialog" returnFocusRef={returnFocusRef} initialFocusRef={first} onClose={close} closeDisabled={busy || uncertain}
      footer={<div className="ui-actions gm-waitlist-dialog-actions"><Button type="button" variant="secondary" disabled={blocked} onClick={close}>Otkaži</Button>
        <Button type="submit" form={id} className="gm-waitlist-primary" loading={busy}
          disabled={!uncertain && (requiredDataLoading || Boolean(requiredDataError) || Boolean(sourceChanged) || free || slot?.status === 'UNAVAILABLE')}>
          {uncertain ? 'Ponovi isti zahtev' : entry ? 'Sačuvaj izmene' : 'Dodaj na listu čekanja'}</Button></div>}>
      <p className="gm-waitlist-form-help">Prijava se dodaje za zauzet termin. Ponudu automatski šalje sistem, a prihvata je klijent.</p>
      <form id={id} className="ui-form-grid gm-waitlist-form" onSubmit={submit}>
        <div className="gm-waitlist-form-wide">{entry ? <div className="gm-waitlist-fixed-customer"><strong>{entry.customerName}</strong><small>Klijent postojeće prijave se ne menja.</small></div>
          : <CustomerPicker value={form.customerId} required disabled={blocked} onChange={customerId => change({ customerId })} />}</div>
        <FormField label="Usluga *" htmlFor={id + '-service'}><Select ref={first} id={id + '-service'} required disabled={blocked || services.isLoading} value={form.serviceId}
          onChange={event => change({ serviceId: event.target.value, resourceId: '' })}><option value="">Izaberite uslugu</option>
          {entry && !services.data?.some(item => item.id === entry.serviceId) && <option value={entry.serviceId} disabled>{entry.serviceName} · nedostupna</option>}
          {services.data?.map(item => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min</option>)}</Select></FormField>
        <FormField label="Zaposleni *" htmlFor={id + '-employee'}><Select id={id + '-employee'} required disabled={blocked || employees.isLoading} value={form.employeeId}
          onChange={event => change({ employeeId: event.target.value })}><option value="">Izaberite zaposlenog</option>
          {entry && !employees.data?.some(item => item.id === entry.employeeId) && <option value={entry.employeeId} disabled>{entry.employeeName} · nedostupan</option>}
          {employees.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>
        <FormField label="Lokal" htmlFor={id + '-location'}><Select id={id + '-location'} value={form.locationId} disabled={blocked || locations.isLoading || scope.isLoading}
          onChange={event => change({ locationId: event.target.value, areaId: '', resourceId: '' })}><option value="">Bez određenog lokala</option>
          {locations.data?.filter(item => item.active && (all || scope.data?.locationIds.includes(item.id) || resources.data?.some(resource => resource.locationId === item.id && scope.data?.resourceIds.includes(resource.id))))
            .map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>
        <FormField label="Zona" htmlFor={id + '-area'}><Select id={id + '-area'} value={form.areaId} disabled={blocked || !form.locationId || areas.isLoading}
          onChange={event => change({ areaId: event.target.value, resourceId: '' })}><option value="">Sve zone izabranog lokala</option>
          {areas.data?.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>
        <div className="gm-waitlist-form-wide"><FormField label="Računar / resurs" htmlFor={id + '-resource'} hint="Fleksibilan izbor je dozvoljen samo kada ceo izbor ostaje u vašem opsegu.">
          <Select id={id + '-resource'} disabled={blocked || !form.serviceId || resources.isLoading || scope.isLoading} value={form.resourceId}
            onChange={event => { const chosen = resources.data?.find(item => item.id === event.target.value); change({ resourceId: event.target.value,
              ...(chosen ? { locationId: chosen.locationId, areaId: chosen.areaId ?? '' } : {}) }) }}>
            <option value="" disabled={!flexible}>Bez određenog resursa</option>
            {permitted.map(item => <option key={item.id} value={item.id} disabled={!item.available}>{item.code} · {item.name}{!item.available ? ' · nije dostupan' : ''}</option>)}
          </Select></FormField></div>
        <FormField label="Željeni datum *" htmlFor={id + '-date'}><Input id={id + '-date'} type="date" required value={form.date}
          min={todayInBusinessZone(new Date(now))} disabled={blocked} onChange={event => change({ date: event.target.value })} /></FormField>
        <FormField label="Početak termina *" htmlFor={id + '-time'} hint="Vreme lokala · Europe/Belgrade"><Input id={id + '-time'} type="time" step="60" required value={form.time}
          disabled={blocked} onChange={event => change({ time: event.target.value })} /></FormField>
        <div className="gm-waitlist-form-wide gm-waitlist-duration"><WaitlistIcon kind="clock" /><span>Kraj termina: <strong>{end ? formatBusinessTime(end) : '-'}</strong> · {service?.durationMinutes ?? '-'} min
          {end && businessInstantToLocal(end).slice(0,10) !== form.date && <small> Završetak: {businessInstantToLocal(end).slice(0,10)}</small>}</span></div>
        <div className="gm-waitlist-form-wide"><FormField label="Interna napomena" htmlFor={id + '-note'} hint={`${form.note.length}/500 · vidljivo ovlašćenom osoblju`}>
          <Textarea id={id + '-note'} rows={3} maxLength={500} value={form.note} disabled={blocked} onChange={event => change({ note: event.target.value })} /></FormField></div>
        {!entry && <label className="gm-waitlist-consent gm-waitlist-form-wide"><Input type="checkbox" required checked={form.consent} disabled={blocked}
          onChange={event => change({ consent: event.target.checked })} /><span>Potvrđujem da je klijent tražio prijavu ili pristao na listu čekanja. *</span></label>}
        {entry && <p className="gm-waitlist-form-help gm-waitlist-form-wide">Promena usluge, zaposlenog, resursa, lokala, zone ili termina menja mesto u redu. Izmena napomene čuva redosled.</p>}
        {requiredDataError && <div className="gm-waitlist-form-wide"><ErrorState message="Podatke za izbor nije moguće učitati." action={<Button type="button" variant="secondary"
          onClick={() => { void services.refetch(); void employees.refetch(); void locations.refetch(); void scope.refetch() }}>Pokušaj ponovo</Button>} /></div>}
        {(resources.error || areas.error) && <Alert tone="danger" className="gm-waitlist-form-wide" role="alert">Resurse ili zone nije moguće učitati. <Button type="button" variant="secondary" onClick={() => { void resources.refetch(); if (form.locationId) void areas.refetch() }}>Pokušaj ponovo</Button></Alert>}
        {!uncertain && availability.isFetching && <p className="gm-waitlist-form-help gm-waitlist-form-wide" role="status">Provera celog termina…</p>}
        {!uncertain && slot?.status === 'UNAVAILABLE' && <Alert tone="warning" className="gm-waitlist-form-wide">Termin nije dostupan za izabranog zaposlenog ili resurs. Promenite izbor.</Alert>}
        {free && !uncertain && <Alert tone="warning" className="gm-waitlist-form-wide">Izabrani termin je slobodan. Možete napraviti direktnu rezervaciju. <Link to={directReservation}>Otvori rezervaciju</Link></Alert>}
        {availability.error && <p className="gm-waitlist-form-help gm-waitlist-form-wide">Pregled dostupnosti nije učitan. Konačnu proveru radi server prilikom čuvanja. <Button type="button" variant="secondary" onClick={() => void availability.refetch()}>Ponovi proveru</Button></p>}
        {(error || timeError) && <Alert tone="danger" className="gm-waitlist-form-wide" role="alert">{error || timeError}</Alert>}
        {sourceChanged && <p className="gm-waitlist-form-help gm-waitlist-form-wide">Aktuelni podaci su osveženi. Zatvorite formu i ponovo otvorite izmenu prijave.</p>}
      </form>
    </Modal>
    {confirmationDialog}
  </>
}

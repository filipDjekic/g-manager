import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { availabilityApi } from '../../api/availabilityApi'
import { resourceApi } from '../../api/resourceApi'
import { reservationApi } from '../../api/reservationApi'
import { waitlistApi } from '../../api/waitlistApi'
import { IdempotencyKeyManager, isConflictResponse } from '../../api/idempotency'

import { useToast } from '../../components/ui/toastContext'
import { businessInstantToLocal, businessLocalToInstant } from '../dateTime'

import { validTime } from '../ReservationTimePicker.model'

import type { CatalogItem } from '../../types/catalog.types'
import type { UserResponse } from '../../types/user.types'
import type { AvailabilitySlot } from '../../types/availability.types'
import type { CreateReservationInput, RecurrenceConflictPolicy, RecurrenceCreateResult, RecurrenceFrequency, RecurrenceInput, ReservationCreationRequest } from '../../types/reservation.types'

import { customerReservationError } from './customerPresentation.model'
import { useFormClose } from '../../forms/useFormClose'
import { useDirtyGuard } from '../../forms/useDirtyGuard'

export interface BookingPrefill { serviceId?: string; resourceId?: string; locationId?: string; areaId?: string; employeeId?: string }
export type CustomerBookingProps = {
  prefill: BookingPrefill; services: CatalogItem[]; employees: UserResponse[]; loading: boolean; dataError: unknown
  returnFocusRef: RefObject<HTMLElement | null>; onReload: () => void; onScopeChanged: (value: BookingPrefill) => void
  onCreated: (id?: string) => Promise<void>; onWaitlisted: () => Promise<void>; onClose: () => void
}
export function useCustomerBooking({ prefill, services, employees, loading, dataError, onCreated, onWaitlisted, onClose }: CustomerBookingProps) {
  const id = useId(), toast = useToast()
  const [serviceId, setServiceId] = useState(prefill.serviceId ?? ''), [resourceId, setResourceId] = useState(prefill.resourceId ?? '')
  const [locationId, setLocationId] = useState(prefill.locationId ?? ''), [areaId, setAreaId] = useState(prefill.areaId ?? '')
  const [employeeChoice, setEmployeeChoice] = useState(prefill.employeeId ?? 'ANY'), [date, setDate] = useState('')
  const [fromTime, setFromTime] = useState(''), [toTime, setToTime] = useState(''), [endDate, setEndDate] = useState('')
  const [durationChoice, setDurationChoice] = useState<number>()
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
  const selectedResource = resources.find(value => value.id === resourceId)
  const locations = [...new Map(resources.map(value => [value.locationId, value.locationName])).entries()]
  const scopedLocationId = locationId || selectedResource?.locationId || (locations.length === 1 ? locations[0][0] : '')
  const areas = [...new Map(resources.filter(value => value.locationId === scopedLocationId).filter(value => value.areaId)
      .map(value => [value.areaId!, value.areaName || value.areaId!])).entries()]
  const scopedAreaId = areaId || selectedResource?.areaId || (areas.length === 1 ? areas[0][0] : '')
  const resourceRequired = rules?.resourceRequired ?? service?.requiresResource ?? false
  const physicalStep = resourceRequired || Boolean(resourceId), scopeReady = !resourceRequired || Boolean(scopedLocationId && scopedAreaId)
  const minimum = rules?.variableDuration ? Math.max(30, rules.minimumDurationMinutes) : rules?.minimumDurationMinutes ?? 30
  const defaultDuration = rules?.variableDuration ? Math.min(rules.maximumDurationMinutes, Math.max(minimum, rules.defaultDurationMinutes)) : rules?.defaultDurationMinutes ?? service?.durationMinutes ?? 30
  let manualStart = '', timeError = '', duration = durationChoice ?? defaultDuration
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
  const releaseNavigation = useDirtyGuard(blocked || !!selectedStart || !!note || recurring, { pending: blocked })
  const dismiss = useFormClose(!recurrenceResult && !!(selectedStart || note || recurring), blocked, onClose)
  const canSubmit = Boolean(!loading && !dataError && service && rules && employeeValid && scopeReady && !timeError && chosenSlot && (!occupied || recurring) && chosenSlot.status !== 'UNAVAILABLE'
      && !availability.isFetching && !availability.isError && !resourceOptions.isFetching && !resourceOptions.isError
      && (!physicalStep || resolvedResourceId && (recurring || !slotResources.isFetching && !slotResources.isError && !resourceUnavailable))
      && (!recurring || employeeChoice !== 'ANY' && preview.data && !preview.isFetching && !preview.isError && preview.data.occurrences.some(value => value.available)
        && (conflictPolicy !== 'ALL_OR_NOTHING' || preview.data.occurrences.every(value => value.available))))
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
        toast(request.kind === 'RECURRING' ? 'Serija rezervacija je obrađena.' : 'Zahtev poslat — čeka potvrdu.', 'success')
        releaseNavigation()
        await onCreated(request.kind === 'SINGLE' ? createdId : undefined).catch(() => toast('Rezervacija je sačuvana. Osvežite spisak za njen status.', 'info'))
      } catch (cause) {
        keys.failed(cause); if (!keys.pendingKey()) pending.current = null
        if (isConflictResponse(cause) && !keys.pendingKey()) {
          if (!recurring) resetSelection()
          setError(recurring ? 'Dostupnost serije se promenila. Osvežite i proverite konflikte pre novog pokušaja.' : 'Termin je u međuvremenu zauzet. Izaberite ga ponovo ili se prijavite na listu čekanja.')
          if (recurring) await preview.refetch()
          await availability.refetch()
        } else setError(keys.pendingKey() ? 'Ishod prethodnog zahteva nije potvrđen. Proverite isti zahtev pre novog rezervisanja.' : customerReservationError(cause, 'Termin nije moguće rezervisati. Pokušajte ponovo.'))
      } finally { inFlight.current = false; setSubmitting(false) }
    }
  async function joinWaitlist() {
      if (!canJoin || !chosenSlot?.employeeId || inFlight.current || blocked) return
      inFlight.current = true; setJoining(true); setError('')
      try {
        await waitlistApi.join({ serviceId, employeeId: chosenSlot.employeeId, resourceId: resolvedResourceId || undefined,
          locationId: resolvedLocationId || undefined, desiredStart: chosenSlot.startTime })
        toast('Dodati ste na listu čekanja za izabrani termin.', 'success'); releaseNavigation(); await onWaitlisted()
      } catch (cause) { setError(customerReservationError(cause, 'Prijava na listu čekanja nije uspela.')); await availability.refetch() }
      finally { inFlight.current = false; setJoining(false) }
    }
  return {
    id, serviceId, setServiceId, resourceId, setResourceId, setLocationId, setAreaId,
    employeeChoice, setEmployeeChoice, date, setDate, fromTime, setFromTime, toTime,
    setToTime, endDate, setEndDate, durationChoice, setDurationChoice, selectedStart, note,
    setNote, recurring, setRecurring, frequency, setFrequency, recurrenceInterval, setRecurrenceInterval,
    occurrences, setOccurrences, conflictPolicy, setConflictPolicy, recurrenceResult, error, submitting,
    joining, frozen, blocked, service, resourceOptions, rules, resources,
    selectedResource, locations, scopedLocationId, areas, scopedAreaId, resourceRequired, physicalStep,
    scopeReady, minimum, defaultDuration, manualStart, timeError, duration, availability,
    slots, chosenSlot, occupied, resolvedResourceId, assigned, slotResources, resourceUnavailable,
    preview, dismiss, canSubmit, needsStandardWaitlist, waitlistAvailability, canJoin, resetSelection,
    choose, create, joinWaitlist
  }
}

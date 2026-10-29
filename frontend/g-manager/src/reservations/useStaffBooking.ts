import { useServerNow } from '../gaming/useServerNow'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { catalogApi } from '../api/catalogApi'
import { customerApi } from '../api/customerApi'
import { resourceApi } from '../api/resourceApi'
import { reservationApi } from '../api/reservationApi'
import { userApi } from '../api/userApi'
import { IdempotencyKeyManager } from '../api/idempotency'
import { useAuthStore } from '../auth/authStore'

import { validTime } from './ReservationTimePicker.model'

import { businessInstantToLocal, businessLocalToInstant, formatBusinessDateTime as formatDateTime } from './dateTime'
import type { CatalogItem } from '../types/catalog.types'
import type { RecurrenceInput, RecurrenceFrequency, RecurrenceConflictPolicy, RecurrenceCreateResult, ReservationCreationRequest, ReservationBookingPlan } from '../types/reservation.types'
import './reservations.css'
import { useFormClose } from '../forms/useFormClose'
import { useDirtyGuard } from '../forms/useDirtyGuard'
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
  let page = 0, totalPages: number
  do {
    const result = await catalogApi.list({page, size: 100, type: 'SERVICE', active: true, sort: 'name', direction: 'ASC'})
    result.content.forEach(item => items.set(item.id,item)); totalPages = result.totalPages; page++
  } while (page < totalPages)
  return [...items.values()].sort((first,second) => first.name.localeCompare(second.name,'sr-Latn-RS') || first.id.localeCompare(second.id))
}
export { formatBusinessDateTime }
export { intervalLabels }
export { localRange }
export { addDays }
export { durationLabel }
export type StaffBookingProps = {onClose:()=>void;onCreated:(id:string,summary?:string)=>void;
  initial?: { startTime?: string; employeeId?: string; resourceId?: string; locationId?: string; areaId?: string }}
export function useStaffBooking({ onClose, onCreated, initial }: StaffBookingProps) {
  const now = useServerNow()
  const actor = useAuthStore(state => state.user), client = useQueryClient(), formId = useId()
  const [customerId,setCustomerId] = useState(''), [customerName,setCustomerName] = useState('')
  const [serviceId,setServiceId] = useState(''), [employeeId,setEmployeeId] = useState(initial?.employeeId || (actor?.role === 'EMPLOYEE' ? actor.id : ''))
  const [locationId,setLocationId] = useState(initial?.locationId ?? ''), [areaId,setAreaId] = useState(initial?.areaId ?? ''), [resourceId,setResourceId] = useState(initial?.resourceId ?? '')
  const [range,setRange] = useState<TimeRange>(() => {
      const future = businessInstantToLocal(initial?.startTime ?? new Date((Math.floor(Date.now()/900000) + 1)*900000).toISOString())
      const [date, from] = future.split('T'); return {date, from, to: '', endDate: date}
    })
  const [note,setNote] = useState(''), [review,setReview] = useState(false), [repeat,setRepeat] = useState(false)
  const [frequency,setFrequency] = useState<RecurrenceFrequency>('WEEKLY'), [interval,setInterval] = useState(1), [occurrences,setOccurrences] = useState(4)
  const [conflictPolicy,setConflictPolicy] = useState<RecurrenceConflictPolicy>('ALL_OR_NOTHING')
  const [seriesResult,setSeriesResult] = useState<RecurrenceCreateResult | null>(null)
  const [keys] = useState(() => new IdempotencyKeyManager()), pending = useRef<ReservationCreationRequest | null>(null), submitting = useRef(false)
  const initializedService = useRef('')
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
  const needsResource = !!rules?.resourceRequired
  let start = '', end = '', inputError = '', duration = 0
  try {
      if (range.date && validTime(range.from)) start = initial?.startTime && businessInstantToLocal(initial.startTime) === `${range.date}T${range.from}`
        ? initial.startTime : businessLocalToInstant(`${range.date}T${range.from}`)
      if (!start || !range.endDate || !validTime(range.to)) inputError = 'Izaberite datum i unesite oba vremena u formatu HH:mm.'
      else {
        end = businessLocalToInstant(`${range.endDate}T${range.to}`)
        duration = (Date.parse(end) - Date.parse(start))/60000
        if (!Number.isInteger(duration) || duration <= 0) inputError = 'Vreme završetka mora biti posle početka. Za termin preko ponoći promenite datum završetka.'
        else if (Date.parse(start) <= now) inputError = 'Rezervacija mora početi u budućnosti.'
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
      if (!rules || !serviceId || !validTime(range.from) || !range.date || keys.pendingKey() || submitting.current) return
      if (rules.variableDuration && initializedService.current === serviceId) return
      try {
        const begin = initial?.startTime && businessInstantToLocal(initial.startTime) === `${range.date}T${range.from}`
          ? initial.startTime : businessLocalToInstant(`${range.date}T${range.from}`)
        const initialDuration = rules.variableDuration ? Math.min(rules.maximumDurationMinutes,Math.max(rules.minimumDurationMinutes,rules.defaultDurationMinutes)) : rules.defaultDurationMinutes
        const next = localRange(begin,new Date(Date.parse(begin) + initialDuration*60000).toISOString())
        initializedService.current = serviceId
        // Initialize the service-defined duration after booking rules arrive, preserving the user-selected start.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRange(current => current.to === next.to && current.endDate === next.endDate ? current : {...current,to: next.to,endDate: next.endDate})
      } catch { /* incomplete or nonexistent local time */ }
    }, [serviceId,rules,range.from,range.date,initial?.startTime,keys])
  const validScope = !needsResource || !!locationId && !!areaId
  const validResource = !resourceId || !!resource
  const planParams = {serviceId,employeeId: employeeId || undefined,resourceId: resourceId || undefined,locationId: locationId || undefined,
      areaId: areaId || undefined,date: range.date,start: !inputError ? start : undefined,durationMinutes: !inputError ? duration : undefined}
  const plan = useQuery({queryKey: ['staff-booking-plan',actor?.id,planParams],queryFn: () => reservationApi.bookingPlan(planParams),
      enabled: !!rules && !!range.date && validScope && validResource,refetchInterval: 15000,retry: false})
  const applyAlternative = (alternative: ReservationBookingPlan['alternatives'][number]) => {
       setRange(localRange(alternative.startTime,alternative.endTime))
    }
  const recurrenceInput: RecurrenceInput = {customerId,serviceId,employeeId,resourceId: resourceId || undefined,locationId: locationId || undefined,
      areaId: areaId || undefined,durationMinutes: duration,startTime: start,note: note || undefined,frequency,interval,occurrences,conflictPolicy}
  const preview = useQuery({queryKey: ['staff-recurrence-preview',JSON.stringify(recurrenceInput)],queryFn: () => reservationApi.previewRecurrence(recurrenceInput),
      enabled: repeat && !!employeeId && !!customerId && !!service && !!rules && !inputError && validScope && validResource,retry: false,refetchInterval: 15000})
  const frozen = !!keys.pendingKey()
  const create = useMutation<StaffReservationResult,Error,void>({mutationFn: () => {
      const request: ReservationCreationRequest = pending.current ?? (repeat ? {kind: 'RECURRING',input: recurrenceInput}
        : {kind: 'SINGLE',input: {customerId,serviceId,employeeId: employeeId || undefined,resourceId: resourceId || undefined,
          locationId: locationId || undefined,areaId: areaId || undefined,durationMinutes: duration,startTime: start,note: note || undefined}})
      pending.current = request
      if (request.kind === 'RECURRING') return reservationApi.createRecurrence(request.input,keys.begin()).then(result => ({id: result.created[0].id,
        summary: `Kreirano ${result.created.length}, preskočeno ${result.skipped.length} termina.`,recurrence: result}))
      return reservationApi.create(request.input,keys.begin()).then(value => ({id: value.id,summary: 'Rezervacija je kreirana.',recurrence: undefined}))
    },onSuccess: async value => {
      keys.succeeded(); pending.current = null
      await Promise.all([client.invalidateQueries({queryKey: ['reservations']}),client.invalidateQueries({queryKey: ['staff-booking-plan']}),client.invalidateQueries({queryKey: ['staff-booking-options']})])
      if (value.recurrence) setSeriesResult(value.recurrence); else { releaseNavigation(); onCreated(value.id,value.summary) }
    },onError: async error => {
      keys.failed(error); if (!keys.pendingKey()) pending.current = null
      await Promise.all([options.refetch(),settings.refetch(),scope.refetch(),plan.refetch()])
    },onSettled: () => {submitting.current = false}})
  const permitted = scope.data?.allResources || !needsResource && !!rules && actor?.role === 'EMPLOYEE' && employeeId === actor.id || (repeat ? (conflictPolicy === 'ALL_OR_NOTHING'
      ? preview.data?.occurrences.every(item => item.available && !!item.resourceId && scope.data?.resourceIds.includes(item.resourceId))
      : preview.data?.occurrences.some(item => item.available && !!item.resourceId && scope.data?.resourceIds.includes(item.resourceId)))
      : !!plan.data?.resourceId && scope.data?.resourceIds.includes(plan.data.resourceId))
  const eligible = !!customer.data?.customer.active && !customer.error && !customer.isFetching && !!service && !!rules && !inputError
      && validScope && validResource && !options.isFetching && !options.error && !settings.error && !scope.error && !scope.isLoading && !!permitted
      && (repeat ? !!employeeId && !preview.isFetching && !preview.error && !!preview.data
        && (conflictPolicy === 'ALL_OR_NOTHING' ? preview.data.occurrences.every(item => item.available) : preview.data.occurrences.some(item => item.available))
        : !plan.isFetching && !plan.error && !!plan.data?.available)
  const blocked = create.isPending || frozen
  const releaseNavigation = useDirtyGuard(blocked || !seriesResult && !!(customerId || serviceId || note), { pending: blocked })
  const dismiss = useFormClose(!seriesResult && !!(customerId || serviceId || note), blocked, onClose)
  const minimum = rules?.minimumDurationMinutes ?? 30
  const nearestEnd = start ? new Date(Date.parse(start) + minimum*60000).toISOString() : ''
  const today = businessInstantToLocal(new Date().toISOString()).split('T')[0]
  const areaName = areas.data?.find(item => item.id === areaId)?.name
  const activeLocation = locations.data?.some(item => item.id === locationId && item.active)
  const activeArea = areas.data?.some(item => item.id === areaId && item.active && item.locationId === locationId)
  const canSubmit = eligible && (!needsResource || !!activeLocation && !!activeArea)
  return {
    formId, customerId, setCustomerId, customerName, setCustomerName, serviceId, setServiceId,
    employeeId, setEmployeeId, locationId, setLocationId, areaId, setAreaId, resourceId,
    setResourceId, range, setRange, note, setNote, review, setReview,
    repeat, setRepeat, frequency, setFrequency, interval, setInterval, occurrences,
    setOccurrences, conflictPolicy, setConflictPolicy, seriesResult, submitting, initializedService, services,
    service, customer, employees, locations, areas, scope, settings,
    rules, needsResource, start, end, inputError, duration, options,
    compatible, resource, validScope, validResource, plan, applyAlternative, preview,
    frozen, create, blocked, dismiss, minimum, nearestEnd, today,
    areaName, canSubmit
  }
}

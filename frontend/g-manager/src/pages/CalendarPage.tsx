import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { reservationApi } from '../api/reservationApi'
import { resourceApi } from '../api/resourceApi'
import { CustomerPicker } from '../reservations/CustomerPicker'
import { ReservationScopeSwitch } from '../reservations/ReservationScopeSwitch'
import { userApi } from '../api/userApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { queryKeys } from '../query/queryKeys'
import { dateInBusinessZone, formatBusinessTime, todayInBusinessZone } from '../reservations/dateTime'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import type { CalendarReservation, ReservationScope, ReservationStatus } from '../types/reservation.types'
import { useListUrlState } from '../lists/useListUrlState'
import { reservationTones } from '../components/ui/statusPresentation'
import { Badge } from '../components/ui'

type View = 'day' | 'week' | 'month'
const allowed=['scope','customerId','locationId','view','date','employeeId','status','resourceId','reservationId'] as const

const parseDate = (value: string) => new Date(`${value}T12:00:00Z`)
const isoDate = (value: Date) => value.toISOString().slice(0, 10)
const addDays = (value: string, days: number) => {
  const date = parseDate(value); date.setUTCDate(date.getUTCDate() + days); return isoDate(date)
}
const startOfWeek = (value: string) => {
  const date = parseDate(value); return addDays(value, -((date.getUTCDay() + 6) % 7))
}
const startOfMonthGrid = (value: string) => startOfWeek(`${value.slice(0, 7)}-01`)
const rangeFor = (view: View, anchor: string) => {
  if (view === 'day') return { from: anchor, to: anchor, days: [anchor] }
  const from = view === 'week' ? startOfWeek(anchor) : startOfMonthGrid(anchor)
  const count = view === 'week' ? 7 : 42
  return { from, to: addDays(from, count - 1), days: Array.from({ length: count }, (_, i) => addDays(from, i)) }
}
const statusLabel: Record<ReservationStatus, string> = {
  PENDING: 'Na čekanju', CONFIRMED: 'Potvrđeno', REJECTED: 'Odbijeno',
  CANCELLED: 'Otkazano', COMPLETED: 'Završeno',
}

export function CalendarPage() {
  const actor = useAuthStore((state) => state.user)
  const defaults=useMemo(()=>({scope:actor?.role==='EMPLOYEE'?'MANAGEABLE':'ALL',customerId:'',locationId:'',view:'week',date:todayInBusinessZone(),employeeId:'',status:'',resourceId:'',reservationId:''}),[actor?.role])
  const url=useListUrlState(defaults,allowed)
  const scope:ReservationScope=url.state.scope==='MANAGEABLE'?'MANAGEABLE':'ALL'
  const view:View=url.state.view==='day'||url.state.view==='month'?url.state.view:'week'
  const anchor=/^\d{4}-\d{2}-\d{2}$/.test(url.state.date)&&Number.isFinite(parseDate(url.state.date).getTime())?url.state.date:defaults.date
  const [selectedDay, setSelectedDay] = useState(anchor)
  const employeeId=url.state.employeeId
  const range = useMemo(() => rangeFor(view, anchor), [view, anchor])
  const employees = useQuery({
    queryKey: ['users', 'calendar-employees'], queryFn: () => userApi.employees(), enabled: hasCapability(actor,'EMPLOYEE_LIST'),
  })
  const result = useQuery({
    queryKey: [...queryKeys.reservationCalendar(range.from, range.to, employeeId || undefined),scope,url.state.customerId,url.state.locationId,actor?.id],
    queryFn: () => reservationApi.calendar({ from: range.from, to: range.to, employeeId: employeeId || undefined,scope,customerId:url.state.customerId||undefined,locationId:url.state.locationId||undefined }),refetchInterval:15000,
  })
  const byDay = useMemo(() => (result.data ?? []).filter(item=>(!url.state.status||item.status===url.state.status)&&(!url.state.resourceId||item.resourceId===url.state.resourceId)).reduce<Record<string, CalendarReservation[]>>((map, item) => {
    const day = dateInBusinessZone(item.startTime); (map[day] ??= []).push(item); return map
  }, {}), [result.data,url.state.status,url.state.resourceId])
  const locations=useQuery({queryKey:['resources','locations'],queryFn:resourceApi.locations,enabled:hasCapability(actor,'RESOURCE_READ')})
  const resourceOptions=[...new Map((result.data??[]).filter(item=>item.resourceId).map(item=>[item.resourceId!,item.resourceName??'Resurs'])).entries()]
  const agendaDay = range.days.includes(selectedDay) ? selectedDay : anchor
  const move = (direction: number) => {
    if (view !== 'month') { url.set({date:addDays(anchor, direction * (view === 'day' ? 1 : 7))}); return }
    const date = parseDate(anchor), day = date.getUTCDate()
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + direction)
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(day, last)); url.set({date:isoDate(date)})
  }
  const renderEvent = (item: CalendarReservation) => <button key={item.id}
    className={`calendar-event status-${item.status.toLowerCase()} ${item.readOnly?'reservation-readonly':'reservation-manageable'}`} onClick={() => url.set({reservationId:item.id})}
    aria-label={`${formatBusinessTime(item.startTime)} ${item.serviceName}, ${item.customerName}, ${statusLabel[item.status]}`}>
    <time>{formatBusinessTime(item.startTime)}–{formatBusinessTime(item.endTime)}</time><strong>{item.serviceName}</strong>
    <span>{item.customerName}</span><small>{item.employeeName}</small>
    {item.resourceName&&<small>{item.resourceName}</small>}
    <em>{statusLabel[item.status]}</em><small className="reservation-access-label">{item.readOnly?'Samo pregled':'Upravljanje'}</small></button>

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Operativa</p><h1>Kalendar rezervacija</h1></div></div>
    {actor?.role==='EMPLOYEE'&&<ReservationScopeSwitch scope={scope} onChange={scope=>url.set({scope})}/>}
    <p className="search-help">Termini sa oznakom „Samo pregled“ otvaraju detalje bez akcija upravljanja.</p>
    <div className="calendar-toolbar" aria-label="Kontrole kalendara">
      <div className="calendar-navigation"><Button variant="secondary" onClick={() => move(-1)}>Prethodno</Button>
        <Button variant="secondary" onClick={() => url.set({date:todayInBusinessZone()})}>Danas</Button>
        <Button variant="secondary" onClick={() => move(1)}>Sledeće</Button></div>
      <div className="calendar-views" role="group" aria-label="Prikaz kalendara">
        {(['day', 'week', 'month'] as const).map((item) => <Button key={item}
          variant={view === item ? 'primary' : 'secondary'} aria-pressed={view===item} onClick={() => url.set({view:item})}>
          {item === 'day' ? 'Dan' : item === 'week' ? 'Nedelja' : 'Mesec'}</Button>)}</div>
      {hasCapability(actor,'EMPLOYEE_LIST') && <label>Zaposleni<select value={employeeId} onChange={(event) => url.set({employeeId:event.target.value})}>
        <option value="">Svi zaposleni</option>{employees.data?.map((employee) =>
          <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}
      <label>Lokacija<select value={url.state.locationId} onChange={e=>url.set({locationId:e.target.value})}><option value="">Sve lokacije</option>{locations.data?.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      {hasCapability(actor,'CUSTOMER_READ') && <CustomerPicker value={url.state.customerId} onChange={customerId=>url.set({customerId})}/>}
      <label>Datum<input type="date" value={anchor} onChange={event=>{if(event.target.value)url.set({date:event.target.value})}}/></label>
      <label>Status<select value={url.state.status} onChange={event=>url.set({status:event.target.value})}><option value="">Svi statusi</option>{Object.entries(statusLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Resurs<select value={url.state.resourceId} onChange={event=>url.set({resourceId:event.target.value})}><option value="">Svi resursi</option>{resourceOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    </div>
    <p className="calendar-range" aria-live="polite">{range.from} — {range.to} · Europe/Belgrade</p>
    <div className="calendar-legend" aria-label="Statusi termina">{Object.entries(statusLabel).map(([status,label]) =>
      <Badge key={status} tone={reservationTones[status as ReservationStatus]}>{label}</Badge>)}</div>
    {result.isLoading ? <Skeleton lines={7} label="Učitavanje kalendara" /> : result.error
      ? <ErrorState message="Kalendar nije moguće učitati." action={<Button onClick={() => result.refetch()}>Pokušaj ponovo</Button>} />
      : !Object.keys(byDay).length ? <EmptyState title="Nema rezervacija u periodu" description="Promenite period, zaposlenog ili filtere." />
      : <><section className={`calendar-grid ${view}`} aria-label={`${view === 'day' ? 'Dnevni' : view === 'week' ? 'Nedeljni' : 'Mesečni'} kalendar`}>
        {range.days.map((day) => <article className={`calendar-day${day === todayInBusinessZone() ? ' is-today' : ''}${day === agendaDay ? ' is-selected' : ''}${view === 'month' && day.slice(0,7) !== anchor.slice(0,7) ? ' outside-month' : ''}`} key={day}>
          <h2>{view === 'month' ? <button className="calendar-day-select" type="button" aria-pressed={day === agendaDay}
            aria-label={`${day}, ${byDay[day]?.length ?? 0} termina`} onClick={() => setSelectedDay(day)}><time dateTime={day}>{parseDate(day).getUTCDate()}</time>
            <span className="calendar-day-count">{byDay[day]?.length || ''}</span></button> : <time dateTime={day}>{new Intl.DateTimeFormat('sr-RS', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(parseDate(day))}</time>}</h2>
          {view === 'month' && <div className="calendar-status-dots" aria-hidden="true">{[...new Set((byDay[day] ?? []).map((item) => item.status))].map((status) => <span key={status} className={`status-${status.toLowerCase()}`} />)}</div>}
          <div className="calendar-events">{[...(byDay[day] ?? [])].sort((a,b) => a.startTime.localeCompare(b.startTime)).map(renderEvent)}</div>
        </article>)}
      </section>
      {view === 'month' && <section className="calendar-day-agenda panel" aria-label="Termini izabranog dana"><h2>{new Intl.DateTimeFormat('sr-RS', { weekday:'long',day:'numeric',month:'long',timeZone:'UTC' }).format(parseDate(agendaDay))}</h2>
        {(byDay[agendaDay] ?? []).length ? <div className="calendar-events">{[...byDay[agendaDay]].sort((a,b) => a.startTime.localeCompare(b.startTime)).map(renderEvent)}</div> : <p>Nema termina za izabrani dan.</p>}
      </section>}</>}
    <ReservationDetailsDrawer reservationId={url.state.reservationId||null} onClose={() => url.set({reservationId:''})} />
  </main>
}

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { reservationApi } from '../api/reservationApi'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { queryKeys } from '../query/queryKeys'
import { dateInBusinessZone, formatBusinessTime, todayInBusinessZone } from '../reservations/dateTime'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import type { CalendarReservation, ReservationStatus } from '../types/reservation.types'
import { useListUrlState } from '../lists/useListUrlState'

type View = 'day' | 'week' | 'month'
const allowed=['view','date','employeeId','status','resourceId','reservationId'] as const

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
  const defaults=useMemo(()=>({view:'week',date:todayInBusinessZone(),employeeId:'',status:'',resourceId:'',reservationId:''}),[])
  const url=useListUrlState(defaults,allowed)
  const view:View=url.state.view==='day'||url.state.view==='month'?url.state.view:'week'
  const anchor=/^\d{4}-\d{2}-\d{2}$/.test(url.state.date)&&Number.isFinite(parseDate(url.state.date).getTime())?url.state.date:defaults.date
  const employeeId=url.state.employeeId
  const range = useMemo(() => rangeFor(view, anchor), [view, anchor])
  const management = actor?.role === 'OWNER' || actor?.role === 'ADMIN'
  const employees = useQuery({
    queryKey: ['users', 'calendar-employees'], queryFn: () => userApi.employees(), enabled: management,
  })
  const result = useQuery({
    queryKey: queryKeys.reservationCalendar(range.from, range.to, employeeId || undefined),
    queryFn: () => reservationApi.calendar({ from: range.from, to: range.to, employeeId: employeeId || undefined }),
  })
  const byDay = useMemo(() => (result.data ?? []).filter(item=>(!url.state.status||item.status===url.state.status)&&(!url.state.resourceId||item.resourceId===url.state.resourceId)).reduce<Record<string, CalendarReservation[]>>((map, item) => {
    const day = dateInBusinessZone(item.startTime); (map[day] ??= []).push(item); return map
  }, {}), [result.data,url.state.status,url.state.resourceId])
  const resourceOptions=[...new Map((result.data??[]).filter(item=>item.resourceId).map(item=>[item.resourceId!,item.resourceName??'Resurs'])).entries()]
  const move = (direction: number) => url.set({date:addDays(anchor, direction * (view === 'day' ? 1 : view === 'week' ? 7 : 28))})

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Operativa</p><h1>Kalendar rezervacija</h1></div></div>
    <div className="calendar-toolbar" aria-label="Kontrole kalendara">
      <div className="calendar-navigation"><Button variant="secondary" onClick={() => move(-1)}>Prethodno</Button>
        <Button variant="secondary" onClick={() => url.set({date:todayInBusinessZone()})}>Danas</Button>
        <Button variant="secondary" onClick={() => move(1)}>Sledeće</Button></div>
      <div className="calendar-views" role="group" aria-label="Prikaz kalendara">
        {(['day', 'week', 'month'] as const).map((item) => <Button key={item}
          variant={view === item ? 'primary' : 'secondary'} aria-pressed={view===item} onClick={() => url.set({view:item})}>
          {item === 'day' ? 'Dan' : item === 'week' ? 'Nedelja' : 'Mesec'}</Button>)}</div>
      {management && <label>Zaposleni<select value={employeeId} onChange={(event) => url.set({employeeId:event.target.value})}>
        <option value="">Svi zaposleni</option>{employees.data?.map((employee) =>
          <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}
      <label>Datum<input type="date" value={anchor} onChange={event=>{if(event.target.value)url.set({date:event.target.value})}}/></label>
      <label>Status<select value={url.state.status} onChange={event=>url.set({status:event.target.value})}><option value="">Svi statusi</option>{Object.entries(statusLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Resurs<select value={url.state.resourceId} onChange={event=>url.set({resourceId:event.target.value})}><option value="">Svi resursi</option>{resourceOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    </div>
    <p className="calendar-range" aria-live="polite">{range.from} — {range.to} · Europe/Belgrade</p>
    {result.isLoading ? <Skeleton lines={7} label="Učitavanje kalendara" /> : result.error
      ? <ErrorState message="Kalendar nije moguće učitati." action={<Button onClick={() => result.refetch()}>Pokušaj ponovo</Button>} />
      : !Object.keys(byDay).length ? <EmptyState title="Nema rezervacija u periodu" description="Promenite period, zaposlenog ili filtere." />
      : <section className={`calendar-grid ${view}`} aria-label={`${view} kalendar`}>
        {range.days.map((day) => <article className="calendar-day" key={day}>
          <h2><time dateTime={day}>{new Intl.DateTimeFormat('sr-RS', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(parseDate(day))}</time></h2>
          <div className="calendar-events">{(byDay[day] ?? []).map((item) => <button key={item.id}
            className={`calendar-event status-${item.status.toLowerCase()}`} onClick={() => url.set({reservationId:item.id})}
            aria-label={`${formatBusinessTime(item.startTime)} ${item.serviceName}, ${item.customerName}, ${statusLabel[item.status]}`}>
            <time>{formatBusinessTime(item.startTime)}</time><strong>{item.serviceName}</strong>
            <span>{item.customerName}</span>{management && <small>{item.employeeName}</small>}
            {item.resourceName&&<small>{item.resourceName}</small>}
            <em>{statusLabel[item.status]}</em></button>)}</div>
        </article>)}
      </section>}
    <ReservationDetailsDrawer reservationId={url.state.reservationId||null} onClose={() => url.set({reservationId:''})} />
  </main>
}

import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { reservationApi } from '../api/reservationApi'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { queryKeys } from '../query/queryKeys'
import { dateInBusinessZone, formatBusinessTime, todayInBusinessZone } from '../reservations/dateTime'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import type { CalendarReservation, ReservationStatus } from '../types/reservation.types'

type View = 'day' | 'week' | 'month'

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
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(todayInBusinessZone())
  const [employeeId, setEmployeeId] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const range = useMemo(() => rangeFor(view, anchor), [view, anchor])
  const management = actor?.role === 'OWNER' || actor?.role === 'ADMIN'
  const employees = useQuery({
    queryKey: ['users', 'calendar-employees'], queryFn: () => userApi.employees(), enabled: management,
  })
  const result = useQuery({
    queryKey: queryKeys.reservationCalendar(range.from, range.to, employeeId || undefined),
    queryFn: () => reservationApi.calendar({ from: range.from, to: range.to, employeeId: employeeId || undefined }),
  })
  const byDay = useMemo(() => (result.data ?? []).reduce<Record<string, CalendarReservation[]>>((map, item) => {
    const day = dateInBusinessZone(item.startTime); (map[day] ??= []).push(item); return map
  }, {}), [result.data])
  const move = (direction: number) => setAnchor(addDays(anchor, direction * (view === 'day' ? 1 : view === 'week' ? 7 : 28)))

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Operativa</p><h1>Kalendar rezervacija</h1></div></div>
    <div className="calendar-toolbar" aria-label="Kontrole kalendara">
      <div className="calendar-navigation"><Button variant="secondary" onClick={() => move(-1)}>Prethodno</Button>
        <Button variant="secondary" onClick={() => setAnchor(todayInBusinessZone())}>Danas</Button>
        <Button variant="secondary" onClick={() => move(1)}>Sledeće</Button></div>
      <div className="calendar-views" role="group" aria-label="Prikaz kalendara">
        {(['day', 'week', 'month'] as const).map((item) => <Button key={item}
          variant={view === item ? 'primary' : 'secondary'} onClick={() => setView(item)}>
          {item === 'day' ? 'Dan' : item === 'week' ? 'Nedelja' : 'Mesec'}</Button>)}</div>
      {management && <label>Zaposleni<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
        <option value="">Svi zaposleni</option>{employees.data?.map((employee) =>
          <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}
    </div>
    <p className="calendar-range" aria-live="polite">{range.from} — {range.to} · Europe/Belgrade</p>
    {result.isLoading ? <Skeleton lines={7} label="Učitavanje kalendara" /> : result.error
      ? <ErrorState message="Kalendar nije moguće učitati." action={<Button onClick={() => result.refetch()}>Pokušaj ponovo</Button>} />
      : !result.data?.length ? <EmptyState title="Nema rezervacija u periodu" description="Promenite period ili zaposlenog." />
      : <section className={`calendar-grid ${view}`} aria-label={`${view} kalendar`}>
        {range.days.map((day) => <article className="calendar-day" key={day}>
          <h2><time dateTime={day}>{new Intl.DateTimeFormat('sr-RS', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(parseDate(day))}</time></h2>
          <div className="calendar-events">{(byDay[day] ?? []).map((item) => <button key={item.id}
            className={`calendar-event status-${item.status.toLowerCase()}`} onClick={() => setSelectedId(item.id)}
            aria-label={`${formatBusinessTime(item.startTime)} ${item.serviceName}, ${item.customerName}, ${statusLabel[item.status]}`}>
            <time>{formatBusinessTime(item.startTime)}</time><strong>{item.serviceName}</strong>
            <span>{item.customerName}</span>{management && <small>{item.employeeName}</small>}
            <em>{statusLabel[item.status]}</em></button>)}</div>
        </article>)}
      </section>}
    <ReservationDetailsDrawer reservationId={selectedId} onClose={() => setSelectedId(null)} />
  </main>
}

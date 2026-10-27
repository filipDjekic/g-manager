import { useEffect, useMemo, useRef, type CSSProperties, type MouseEvent } from 'react'
import { reservationLabels } from '../components/ui/statusPresentation'
import { businessLocalToInstant, formatBusinessTime, todayInBusinessZone } from '../reservations/dateTime'
import type { CalendarContext, CalendarReservation } from '../types/reservation.types'
import { addDays, dateLabel, eventTime } from './calendarModel'
import { quarterHour, weeklyAxis, weeklyEvents, weeklyPosition } from './weeklyModel'
import './weekly.css'

export function CalendarWeek({ days, events, contexts, now, onOpen, onDay, onCreate }: {
  days: string[]; events: CalendarReservation[]; contexts: Map<string, CalendarContext>; now: number
  onOpen: (id: string, event: MouseEvent<HTMLButtonElement>) => void
  onDay: (day: string) => void
  onCreate?: (instant: string, event: MouseEvent<HTMLButtonElement>) => void
}) {
  const model = useMemo(() => weeklyAxis(days), [days])
  const today = todayInBusinessZone(new Date(now)), rowHeight = 22
  const scroll = useRef<HTMLDivElement>(null), initializedWeek = useRef('')
  useEffect(() => {
    const key = days.join(',')
    if (!scroll.current || initializedWeek.current === key) return
    initializedWeek.current = key
    const event = [...events].sort((a, b) => a.startTime.localeCompare(b.startTime))[0]
    const relevant = days.includes(today) ? now : event ? Date.parse(event.startTime) : undefined
    const day = relevant === undefined ? days[0] : todayInBusinessZone(new Date(relevant))
    const slots = model.daySlots.get(day) ?? model.daySlots.get(days[0])!
    const row = relevant === undefined ? model.indexes.get('08:00:0')! : weeklyPosition(relevant, slots, model.indexes, model.rows.length)
    scroll.current.scrollTop = Math.max(0, row - 4) * rowHeight
  }, [days, events, model, now, today])
  return <>
    <p className="gm-calendar-timeline-help">Europe/Belgrade · Kliknite termin za detalje{onCreate ? ' ili slobodan interval za novu rezervaciju' : ''}. Na manjim ekranima pomerite mrežu horizontalno.</p>
    <div ref={scroll} className="gm-week-scroll" role="region" aria-label="Nedeljni vremenski raspored" tabIndex={0}>
      <div className="gm-week-grid" style={{ '--week-row': `${rowHeight}px` } as CSSProperties}>
        <div className="gm-week-corner">Vreme</div>
        {days.map(day => <button key={day} type="button" className={`gm-week-heading${day === today ? ' is-today' : ''}`}
          aria-current={day === today ? 'date' : undefined} onClick={() => onDay(day)}><time dateTime={day}>{dateLabel(day, true)}</time></button>)}
        <div className="gm-week-axis" style={{ height: model.rows.length * rowHeight }}>{model.rows.map((row, index) => row.label.endsWith(':00') &&
          <time key={row.key} style={{ top: index * rowHeight }}>{row.label}{row.occurrence > 0 && <small>ponovo</small>}</time>)}</div>
        {days.map(day => {
          const slots = model.daySlots.get(day)!, byKey = new Map(slots.map(slot => [slot.key, slot]))
          const from = slots[0].instant, to = Date.parse(businessLocalToInstant(`${addDays(day, 1)}T00:00`))
          const context = contexts.get(day), windows = context?.locations.flatMap(location => location.windows) ?? []
          const position = (instant: number) => weeklyPosition(instant, slots, model.indexes, model.rows.length) * rowHeight
          const visible = weeklyEvents(events, from, to)
          return <section className={`gm-week-day${day === today ? ' is-today' : ''}`} key={day} aria-label={dateLabel(day, true)} style={{ height: model.rows.length * rowHeight }}>
            {model.rows.map(row => {
              const slot = byKey.get(row.key), instant = slot?.instant ?? 0
              const open = !!slot && !!context && windows.some(window => Date.parse(window.startTime) <= instant && Date.parse(window.endTime) >= instant + quarterHour)
              const blocked = !!slot && !!context?.employeeBlocks.some(block => Date.parse(block.startTime) < instant + quarterHour && Date.parse(block.endTime) > instant)
              const occupied = !!context?.resources.length && context.resources.every(resource => !resource.canManage
                || !context.locations.find(location => location.id === resource.locationId)?.windows.some(window => Date.parse(window.startTime) <= instant && Date.parse(window.endTime) >= instant + quarterHour)
                || context.occupancy.some(item => item.resourceId === resource.id && Date.parse(item.startTime) < instant + quarterHour && Date.parse(item.endTime) > instant))
              const canCreate = !!onCreate && open && !blocked && !occupied && instant > now
              const label = `${dateLabel(day)} ${row.label}${row.occurrence ? ' (drugo pojavljivanje)' : ''}`
              return <button key={row.key} type="button" className={`gm-week-slot${!slot || context && !open ? ' is-closed' : ''}${blocked ? ' is-blocked' : ''}`}
                disabled={!canCreate} aria-label={`${canCreate ? 'Nova rezervacija' : !slot ? 'Vreme ne postoji' : !context ? 'Dostupnost nije učitana' : blocked ? 'Zaposleni zauzet ili odsutan' : !open ? 'Van radnog vremena' : 'Zauzeto ili proteklo'}: ${label}`}
                title={label} onClick={event => slot && onCreate?.(new Date(slot.instant).toISOString(), event)} />
            })}
            {visible.map(event => <button type="button" key={event.item.id}
              className={`gm-week-event gm-calendar-status-${event.item.status.toLowerCase()}`}
              style={{ top: position(event.start), height: Math.max(18, position(event.end) - position(event.start) - 2),
                left: `calc(${event.lane / event.columns * 100}% + 2px)`, width: `calc(${100 / event.columns}% - 4px)` }}
              title={`${eventTime(event.item)} · ${event.item.serviceName} · ${event.item.customerName} · ${event.item.employeeName} · ${event.item.resourceCode ?? event.item.resourceName ?? 'Bez resursa'} · ${reservationLabels[event.item.status]}`}
              aria-label={`${eventTime(event.item)} · ${event.item.serviceName}, ${event.item.customerName}, ${reservationLabels[event.item.status]}`}
              onClick={click => onOpen(event.item.id, click)}>
              <time>{formatBusinessTime(event.item.startTime)}–{formatBusinessTime(event.item.endTime)}</time>
              <strong>{event.item.serviceName}</strong><span>{event.item.customerName}</span>
              <small>{event.item.employeeName} · {event.item.resourceCode ?? event.item.resourceName ?? 'Bez resursa'}</small>
              <small>{reservationLabels[event.item.status]}</small>
            </button>)}
            {now >= from && now < to && <div className="gm-week-now" style={{ top: position(now) }} aria-label={`Trenutno vreme ${formatBusinessTime(new Date(now).toISOString())}`} />}
          </section>
        })}
      </div>
    </div>
  </>
}

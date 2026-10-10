import { Button } from '../components/ui'
import { reservationLabels } from '../components/ui/statusPresentation'
import { todayInBusinessZone } from '../reservations/dateTime'
import type { CalendarReservation } from '../types/reservation.types'
import { addMonths, dateLabel, monthDays, monthLabel, parseDate, weekdays } from './calendarModel'

export function CalendarMonth({month, selected, byDay, mini = false, onMonth, onSelect}: {
  month: string; selected: string; byDay: Record<string,CalendarReservation[]>; mini?: boolean
  onMonth?: (month: string) => void; onSelect: (day: string) => void
}) {
  const today = todayInBusinessZone()
  return <div className={`gm-calendar-month${mini ? ' gm-calendar-month--mini' : ''}`}>
    {onMonth && <div className="gm-calendar-month-title"><Button type="button" variant="secondary" aria-label="Prethodni mesec" onClick={() => onMonth(addMonths(month,-1))}>‹</Button>
      <strong>{monthLabel(month)}</strong><Button type="button" variant="secondary" aria-label="Sledeći mesec" onClick={() => onMonth(addMonths(month,1))}>›</Button></div>}
    <div className="gm-calendar-month-grid">
      {weekdays.map(day => <span className="gm-calendar-weekday" key={day}>{day}</span>)}
      {monthDays(month).map(day => {
        const events = byDay[day] ?? [], statuses = [...new Set(events.map(item => item.status))]
        return <button type="button" key={day} aria-pressed={day === selected} aria-current={day === today ? 'date' : undefined}
          aria-label={`${dateLabel(day,true)}, ${events.length} rezervacija${statuses.length ? `, ${statuses.map(status => reservationLabels[status]).join(', ')}` : ''}`}
          className={`gm-calendar-date${day === today ? ' is-today' : ''}${day === selected ? ' is-selected' : ''}${day.slice(0,7) !== month.slice(0,7) ? ' is-outside' : ''}`}
          onClick={() => onSelect(day)}><span>{parseDate(day).getUTCDate()}</span>
          {!mini && <small>{events.length ? `${events.length} rez.` : ''}</small>}
          <span className="gm-calendar-dots" aria-hidden="true">{statuses.map(status => <i key={status} className={`gm-calendar-status-${status.toLowerCase()}`} />)}</span>
        </button>
      })}
    </div>
  </div>
}

import { roleLabels } from '../components/ui/statusPresentation'
import { dateInBusinessZone, formatBusinessDateTime, formatBusinessTime } from '../reservations/dateTime'
import type { AuditEvent } from '../types/audit.types'
import { AuditIcon, actionTone, categoryLabels, dayHeading, shortId } from './auditPresentation'

export function AuditTimeline({ events, selected, today, onSelect }: {
  events: AuditEvent[]; selected: string; today: string; onSelect: (event: AuditEvent, opener: HTMLButtonElement) => void
}) {
  const groups: { day: string; events: AuditEvent[] }[] = []
  // Only consecutive date runs are grouped, preserving server sort and page order.
  for (const event of events) {
    const day = dateInBusinessZone(event.occurredAt), last = groups.at(-1)
    if (last?.day === day) last.events.push(event)
    else groups.push({ day, events: [event] })
  }
  return <div className="gm-audit-timeline">{groups.map(group => <section key={group.events[0].id} className="gm-audit-day-group">
    <h3><AuditIcon kind="clock" />{dayHeading(group.events[0].occurredAt, today)}</h3>
    <ol>{group.events.map(event => {
      const tone = actionTone(event), role = roleLabels[event.actorRole]
      return <li key={event.id} className={`gm-audit-timeline-row gm-audit-tone--${tone}`}>
        <time className="gm-audit-event-time" dateTime={event.occurredAt} title={formatBusinessDateTime(event.occurredAt, true, 'sr-Latn-RS')}>{formatBusinessTime(event.occurredAt)}</time>
        <span className="gm-audit-timeline-dot" aria-hidden="true"><AuditIcon kind={tone} /></span>
        <button type="button" className={`gm-audit-event-card${selected === event.id ? ' is-selected' : ''}`} aria-pressed={selected === event.id}
          aria-label={`Detalji događaja ${event.action}, ${formatBusinessDateTime(event.occurredAt, true, 'sr-Latn-RS')}, ${role} ${shortId(event.actorId)}, ${event.resourceType} ${shortId(event.resourceId)}`}
          onClick={click => onSelect(event, click.currentTarget)}>
          <span className="gm-audit-event-card-body">
            <span className="gm-audit-event-title"><strong>{event.action}</strong><span className="gm-audit-category">{categoryLabels[event.category] ?? 'Događaj'}</span></span>
            <span className="gm-audit-event-description">{event.resourceType} · <code title={event.resourceId}>{shortId(event.resourceId)}</code></span>
            <span className="gm-audit-event-actor"><span className="gm-audit-avatar" aria-hidden="true">{role.slice(0, 1)}</span>
              <span>{role} · <code title={event.actorId}>{shortId(event.actorId)}</code></span></span>
            {event.reason && <span className="gm-audit-event-reason">{event.reason}</span>}
          </span>
          <span className="gm-audit-open-label">Detalji<AuditIcon kind="chevronRight" /></span>
        </button>
      </li>
    })}</ol>
  </section>)}</div>
}

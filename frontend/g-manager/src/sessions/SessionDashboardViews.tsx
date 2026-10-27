import { useId, type RefObject } from 'react'
import { Badge, Button, Card, EmptyState, ErrorState, Select, Skeleton } from '../components/ui'
import type { SecurityEventInfo, SessionInfo } from '../types/auth.types'
import { SessionIcon, SessionTime } from './sessionPresentation'
import { deviceIcon, latestLogin, matchesSecurityFilter, securityEventPresentation, securityFilters, type SecurityFilter } from './sessionPresentation.model'
import type { SessionResource } from './useSessionDashboard'

export function SessionHeading({ fetching = false, disabled = false, onRefresh }: {
  fetching?: boolean; disabled?: boolean; onRefresh?: () => void
}) {
  return <header className="gm-session-header">
    <div className="gm-session-heading"><span className="gm-session-heading-icon"><SessionIcon kind="shield" /></span>
      <div><h1>Aktivne sesije</h1><p>Pregledajte svoje uređaje, bezbednosnu istoriju i aktivne prijave.</p></div>
    </div>
    {onRefresh && <Button type="button" variant="secondary" className="gm-session-refresh" loading={fetching}
      disabled={disabled} onClick={onRefresh}><SessionIcon kind="refresh" />Osveži</Button>}
  </header>
}

export function SessionKpis({ sessions, events }: {
  sessions: SessionResource<SessionInfo>; events: SessionResource<SecurityEventInfo>
}) {
  const login = latestLogin(events.data ?? [])
  const metrics = [
    { title: 'Aktivne sesije', icon: 'monitor' as const, tone: 'blue', source: sessions,
      value: sessions.data?.length ?? '—', description: 'Sesije u trenutno učitanoj listi.' },
    { title: 'Prijavljene sesije', icon: 'phone' as const, tone: 'pink', source: sessions,
      value: sessions.data?.length ?? '—', description: 'Broj prijava, a ne fizičkih uređaja.' },
    { title: 'Poslednja prijava', icon: 'clock' as const, tone: 'purple', source: events,
      value: events.data === null ? '—' : login ? <SessionTime value={login.occurredAt} /> : 'Nema dostupnog podatka',
      description: 'Najnovija uspešna prijava u dostupnoj istoriji.' },
    { title: 'Bezbednosni događaji', icon: 'alert' as const, tone: 'blue', source: events,
      value: events.data?.length ?? '—', description: 'Učitana istorija: najviše 50 događaja.' },
  ]
  return <div className="gm-session-kpis">
    {metrics.map(metric => <Card className={`gm-session-kpi gm-session-kpi--${metric.tone}`} key={metric.title}>
      <div className="gm-session-kpi-heading"><span><SessionIcon kind={metric.icon} /></span><h2>{metric.title}</h2></div>
      {metric.source.data === null && metric.source.loading ? <Skeleton lines={1} label={`Učitavanje: ${metric.title}`} />
        : <p className={`gm-session-kpi-value${metric.title === 'Poslednja prijava' ? ' gm-session-kpi-value--date' : ''}`}>{metric.value}</p>}
      <p className="gm-session-kpi-description">{metric.description}</p>
      {metric.source.error && <span className="gm-session-stale">{metric.source.data === null ? 'Podaci nisu dostupni' : 'Poslednji dostupni podaci'}</span>}
    </Card>)}
  </div>
}

function ResourceError({ resource, label, disabled, onRetry }: {
  resource: { data: unknown[] | null; error: string }; label: string; disabled: boolean; onRetry: () => void
}) {
  return resource.error && <div className="gm-session-resource-error">
    <ErrorState title={resource.data === null ? `${label} nisu dostupni` : `${label} nisu osveženi`} message={resource.error}
      action={<Button type="button" variant="secondary" disabled={disabled} onClick={onRetry}>Pokušaj ponovo</Button>} />
    {resource.data !== null && <p>Prikazani su poslednji dostupni podaci. Novo stanje trenutno nije potvrđeno.</p>}
  </div>
}

export function ActiveDevices({ resource, busy, pendingId, headingRef, onRetry, onRevoke, onRevokeAll }: {
  resource: SessionResource<SessionInfo>; busy: boolean; pendingId: string | null
  headingRef: RefObject<HTMLHeadingElement | null>; onRetry: () => void; onRevoke: (session: SessionInfo) => void; onRevokeAll: () => void
}) {
  const id = useId()
  return <Card className="gm-session-panel gm-session-devices">
    <header className="gm-session-panel-header">
      <div className="gm-session-panel-title"><span className="gm-session-panel-icon"><SessionIcon kind="devices" /></span>
        <div><h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>Aktivni uređaji</h2>
          <p>Upravljajte svojim aktivnim prijavama na različitim uređajima.</p></div>
      </div>
      <Button type="button" variant="danger" className="gm-session-revoke-all" disabled={busy || !resource.data?.length}
        loading={pendingId === 'all'} onClick={onRevokeAll}><SessionIcon kind="logout" />Odjavi sve sesije</Button>
    </header>
    <p className="gm-session-panel-note">Odjavljivanje svih sesija uključuje i uređaj koji trenutno koristite.</p>
    <ResourceError resource={resource} label="Podaci o sesijama" disabled={busy} onRetry={onRetry} />
    {resource.data === null && resource.loading ? <Skeleton lines={5} label="Učitavanje aktivnih sesija" />
      : resource.data?.length ? <div className="gm-session-table-wrap" aria-busy={resource.loading || undefined}>
        <table className="gm-session-table gm-session-devices-table" role="table" aria-labelledby={`${id}-title`}>
          <caption className="sr-only">Aktivne prijave. Datumi i vremena su prikazani za Europe/Belgrade.</caption>
          <thead role="rowgroup"><tr role="row">
            {['Uređaj', 'Pregledač / sistem', 'Prijavljen', 'Poslednja aktivnost', 'Ističe', 'Status', 'Akcije'].map(label => <th scope="col" role="columnheader" key={label}>{label}</th>)}
          </tr></thead>
          <tbody role="rowgroup">{resource.data.map(session => <tr key={session.id} role="row" className={session.current ? 'is-current' : ''}>
            <th scope="row" role="rowheader" className="gm-session-device-cell"><div className="gm-session-device-identity">
              <span className="gm-session-device-icon"><SessionIcon kind={deviceIcon(session)} /></span>
              <strong>{session.deviceLabel || 'Nepoznat uređaj'}</strong>
            </div></th>
            <td role="cell" className="gm-session-agent-cell"><span className="gm-session-mobile-label">Pregledač / sistem</span>
              <p>{session.userAgentSummary || 'Nema dostupnog podatka'}</p></td>
            <td role="cell"><span className="gm-session-mobile-label">Prijavljen</span><SessionTime value={session.createdAt} /></td>
            <td role="cell"><span className="gm-session-mobile-label">Poslednja aktivnost</span><SessionTime value={session.lastSeenAt} /></td>
            <td role="cell"><span className="gm-session-mobile-label">Ističe</span><SessionTime value={session.expiresAt} /></td>
            <td role="cell" className="gm-session-status-cell"><span className="gm-session-mobile-label">Status</span>
              <Badge tone={session.current ? 'info' : 'success'}>{session.current ? 'Ovaj uređaj' : 'Aktivna'}</Badge></td>
            <td role="cell" className="gm-session-action-cell"><Button type="button" variant="danger" className="gm-session-revoke"
              disabled={busy} loading={pendingId === session.id} aria-label={`${session.current ? 'Odjavi ovaj uređaj' : 'Odjavi'}: ${session.deviceLabel}`}
              onClick={() => onRevoke(session)}><SessionIcon kind="logout" />{session.current ? 'Odjavi ovaj uređaj' : 'Odjavi'}</Button></td>
          </tr>)}</tbody>
        </table>
      </div> : resource.data !== null && !resource.error && <EmptyState title="Nema aktivnih sesija." />}
  </Card>
}

export function SecurityHistory({ resource, filter, busy, onFilter, onRetry }: {
  resource: SessionResource<SecurityEventInfo>; filter: SecurityFilter; busy: boolean
  onFilter: (filter: SecurityFilter) => void; onRetry: () => void
}) {
  const id = useId()
  const visible = (resource.data ?? []).filter(event => matchesSecurityFilter(event, filter))
  return <Card className="gm-session-panel gm-session-history">
    <header className="gm-session-panel-header">
      <div className="gm-session-panel-title"><span className="gm-session-panel-icon"><SessionIcon kind="clock" /></span>
        <div><h2 id={`${id}-title`}>Bezbednosna istorija</h2><p>Pregled nedavnih bezbednosnih aktivnosti na vašem nalogu.</p></div>
      </div>
      <label className="gm-session-filter" htmlFor={`${id}-filter`}><span className="sr-only">Filter bezbednosnih događaja</span>
        <Select id={`${id}-filter`} value={filter} disabled={resource.data === null}
          onChange={event => {
            const selected = securityFilters.find(value => value.value === event.target.value)
            if (selected) onFilter(selected.value)
          }}>
          {securityFilters.map(value => <option key={value.value} value={value.value}>{value.label}</option>)}
        </Select>
      </label>
    </header>
    <p className="gm-session-panel-note">Filter obuhvata samo učitanu istoriju, najviše 50 poslednjih događaja. Vremenska zona: Europe/Belgrade.</p>
    <ResourceError resource={resource} label="Podaci o istoriji" disabled={busy} onRetry={onRetry} />
    {resource.data === null && resource.loading ? <Skeleton lines={5} label="Učitavanje bezbednosne istorije" />
      : visible.length > 0 ? <>
        <p className="gm-session-history-count" role="status">Prikazano {visible.length} od {resource.data?.length} dostupnih događaja.</p>
        <div className="gm-session-table-wrap" aria-busy={resource.loading || undefined}>
          <table className="gm-session-table gm-session-history-table" role="table" aria-labelledby={`${id}-title`}>
            <thead role="rowgroup"><tr role="row">{['Vreme', 'Događaj', 'Uređaj', 'Detalji'].map(label => <th scope="col" role="columnheader" key={label}>{label}</th>)}</tr></thead>
            <tbody role="rowgroup">{visible.map((event, index) => {
              const presentation = securityEventPresentation[event.type]
              return <tr key={`${event.type}-${event.occurredAt}-${index}`} role="row" data-tone={presentation.tone}>
                <td role="cell" className="gm-session-event-time"><span className="gm-session-mobile-label">Vreme</span><SessionTime value={event.occurredAt} /></td>
                <th role="rowheader" scope="row" className="gm-session-event-name"><div><span className={`gm-session-event-icon gm-session-event-icon--${presentation.tone}`}>
                  <SessionIcon kind={presentation.icon} /></span><strong>{presentation.label}</strong></div>
                  {event.type === 'TOKEN_REUSE' && <Badge tone="warning">Upozorenje</Badge>}</th>
                <td role="cell" className="gm-session-event-device"><span className="gm-session-mobile-label">Uređaj</span>{event.deviceLabel || 'Nema dostupnog podatka'}</td>
                <td role="cell" className="gm-session-event-detail"><p>{presentation.detail}</p></td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </> : resource.data !== null && !resource.error && <EmptyState title={resource.data.length
        ? 'Nema događaja za izabrani filter.' : 'Nema zabeleženih bezbednosnih događaja.'} />}
  </Card>
}

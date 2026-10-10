import { memo } from 'react'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, EmptyState, TableShell } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { GamingStationCard } from '../types/gamingSession.types'
import { enforcementLabels, remaining, stationLabels, stationTones } from './presentation'
import { permitsStationAction, stationConnection, stationMessage, stationSeconds, stationTimer } from './operationsPresentation'

export function GamingOperationsIcon({ kind = 'monitor' }: { kind?: 'monitor' | 'gamepad' | 'play' | 'alert' | 'clock' | 'connection' }) {
  const paths = {
    monitor: 'M3 4h18v12H3z M8 21h8 M12 16v5 M7 9h10',
    gamepad: 'M7 7h10c2 0 3 2 3.5 4l1 6c.5 3-2 4-4 2l-3-3h-5l-3 3c-2 2-4.5 1-4-2l1-6C4 9 5 7 7 7z M6 11h4 M8 9v4 M16 10h.01 M18 12h.01',
    play: 'M9 5l11 7-11 7z M3 5v14',
    alert: 'M12 3 2 21h20z M12 9v5 M12 17h.01',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
    connection: 'M3 8a15 15 0 0 1 18 0 M6 12a10 10 0 0 1 12 0 M9 16a5 5 0 0 1 6 0 M12 20h.01',
  }
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[kind]} /></svg>
}

export interface StationActionHandlers {
  onStart: (station: GamingStationCard) => void
  onExtend: (station: GamingStationCard, minutes: number) => void
  onEnd: (station: GamingStationCard) => void
  onCustom: (station: GamingStationCard) => void
  onHistory: (station: GamingStationCard) => void
  onRecovery: (station: GamingStationCard, confirm: boolean) => void
}

function StationActions({ station, disabled, handlers, compact = false }: {
  station: GamingStationCard; disabled: boolean; handlers: StationActionHandlers; compact?: boolean
}) {
  const actor = useAuthStore((state) => state.user)
  const permit = (action: Parameters<typeof permitsStationAction>[2]) => permitsStationAction(actor, station, action)
  const additional = <>
    {permit('EXTEND') && <>
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => handlers.onExtend(station, 60)}>+60 min</Button>
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => handlers.onCustom(station)}>Prilagođeno produženje</Button>
    </>}
    <Button type="button" variant="secondary" onClick={() => handlers.onHistory(station)}>Detalji i istorija</Button>
  </>
  return <div className={`ops-station-actions${compact ? ' ops-station-actions--compact' : ''}`}>
    {permit('START') && <Button type="button" disabled={disabled} onClick={() => handlers.onStart(station)}>Pokreni sesiju</Button>}
    {permit('EXTEND') && <Button type="button" variant="secondary" disabled={disabled} onClick={() => handlers.onExtend(station, 30)}>+30 min</Button>}
    {permit('TERMINATE') && <Button type="button" variant="danger" disabled={disabled} onClick={() => handlers.onEnd(station)}>Završi</Button>}
    {permit('FORCE_LOCK') && <Button type="button" variant="danger" disabled={disabled} onClick={() => handlers.onRecovery(station, false)}>Ponovo pošalji force-lock</Button>}
    {permit('CONFIRM_LOCKED') && <Button type="button" variant="secondary" disabled={disabled} onClick={() => handlers.onRecovery(station, true)}>Potvrdi fizički lock</Button>}
    {compact ? <details className="ops-more-actions"><summary>Još akcija</summary><div>{additional}</div></details> : additional}
  </div>
}

function StationWarnings({ station }: { station: GamingStationCard }) {
  const pending = !!station.commandSequence && !station.commandAcknowledgedAt
  return <>
    {station.staleHeartbeat && <p className="ops-station-warning ops-station-warning--danger">
      {station.sessionId ? 'Sesija je aktivna na serveru. Proverite vezu i lokalno stanje računara.' : 'Heartbeat je zastareo. Proverite vezu i lokalno stanje računara.'}
    </p>}
    {pending && <p className="ops-station-warning">Komanda #{station.commandSequence} čeka potvrdu klijenta.</p>}
    {station.sessionId && (station.status === 'LOCK_PENDING' || station.status === 'EXPIRED') && <p className="ops-station-warning">{stationMessage(station)}</p>}
  </>
}

export const StationTile = memo(function StationTile({ station, seconds, selected, disabled, onSelect, handlers }: {
  station: GamingStationCard; seconds: number; selected: boolean; disabled: boolean
  onSelect: (station: GamingStationCard) => void; handlers: StationActionHandlers
}) {
  const connectivity = stationConnection(station)
  const expiring = !!station.sessionId && seconds <= 600
  return <article id={`station-${station.resourceId}`}
    className={`ops-station ops-station--${station.status.toLowerCase().replace('_', '-')}${selected ? ' ops-station--selected' : ''}${expiring ? ' ops-station--expiring' : ''}`}
    onClick={(event) => { if (!(event.target as Element).closest('button, a, summary, details')) onSelect(station) }}>
    <header className="ops-station-header">
      <span className="ops-monitor"><GamingOperationsIcon /></span>
      <h3><button type="button" className="ops-station-select" aria-pressed={selected}
        aria-label={`Pregled stanice ${station.resourceName}`} onClick={() => onSelect(station)}>
        {station.resourceName}<small>{station.resourceCode}</small>
      </button></h3>
    </header>
    <Badge tone={stationTones[station.status]}>{stationLabels[station.status]}</Badge>
    <p className="ops-station-location">{station.locationName ?? 'Lokacija'}{station.areaName && ` / ${station.areaName}`}</p>
    {station.sessionId ? <div className="ops-station-session">
      <strong className="ops-station-customer">{station.customerDisplayName ?? 'Klijent'}</strong>
      <span className="ops-timer-label">Preostalo vreme</span>
      <strong className={`ops-timer${expiring ? ' ops-timer--warning' : ''}`} aria-label={`Preostalo vreme ${remaining(seconds)}`}>{stationTimer(seconds)}</strong>
    </div> : <p className={`ops-station-message${station.status === 'LOCK_PENDING' || station.status === 'EXPIRED' ? ' ops-text-warning' : station.status === 'OFFLINE' ? ' ops-text-danger' : ''}`}>{stationMessage(station)}</p>}
    <p className="ops-station-profile">Profil <strong>{station.applicationProfileName ?? 'Nije podešen'}</strong></p>
    <div className="ops-station-signals"><Badge tone={connectivity.tone}><span aria-hidden="true">●</span>{connectivity.label}</Badge>
      <Badge tone={station.enforcementStatus === 'LOCK_PENDING' ? 'warning' : 'neutral'}>{enforcementLabels[station.enforcementStatus]}</Badge></div>
    <StationWarnings station={station} />
    <footer><StationActions station={station} disabled={disabled} handlers={handlers} compact /></footer>
  </article>
})

export function StationDetailsPanel({ station, now, disabled, handlers, unavailable, outsidePage }: {
  station?: GamingStationCard; now: number; disabled: boolean; handlers: StationActionHandlers; unavailable?: boolean; outsidePage?: boolean
}) {
  const connectivity = station && stationConnection(station)
  const seconds = station ? stationSeconds(station, now) : 0
  return <aside className="ui-card ops-detail-panel" aria-labelledby="ops-detail-title">
    <div className="ops-section-heading"><div><p className="eyebrow">Kontrolni panel</p><h2 id="ops-detail-title">Detalji stanice</h2></div><GamingOperationsIcon /></div>
    {!station ? <EmptyState title={unavailable ? 'Izabrana stanica više nije dostupna' : 'Izaberite računar'}
      description="Izaberite karticu ili red u tabeli da biste videli trenutno stanje i dozvoljene akcije." /> : <>
      <div className="ops-detail-identity"><span className="ops-detail-monitor"><GamingOperationsIcon /></span>
        <h3>{station.resourceName}</h3><span>{station.resourceCode}</span><Badge tone={stationTones[station.status]}>{stationLabels[station.status]}</Badge></div>
      {outsidePage && <p className="ops-detail-note">Izabrana stanica nije u trenutnom prikazu kartica.</p>}
      {station.sessionId ? <div className="ops-detail-countdown"><span className="ops-timer-label">Preostalo vreme</span>
        <strong className={`ops-timer${seconds <= 600 ? ' ops-timer--warning' : ''}`} aria-label={`Preostalo vreme ${remaining(seconds)}`}>{stationTimer(seconds)}</strong></div> :
        <p className={`ops-station-message${station.status === 'LOCK_PENDING' || station.status === 'EXPIRED' ? ' ops-text-warning' : station.status === 'OFFLINE' ? ' ops-text-danger' : ''}`}>{stationMessage(station)}</p>}
      <dl className="ops-detail-list">
        {station.sessionId && <><div><dt>Klijent</dt><dd>{station.customerDisplayName ?? 'Klijent'}</dd></div>
          <div><dt>Početak</dt><dd>{station.startedAt ? <time dateTime={station.startedAt}>{formatBusinessDateTime(station.startedAt)}</time> : '—'}</dd></div>
          <div><dt>Planirani kraj</dt><dd>{station.endsAt ? <time dateTime={station.endsAt}>{formatBusinessDateTime(station.endsAt)}</time> : '—'}</dd></div></>}
        <div><dt>Lokacija</dt><dd>{station.locationName ?? '—'}{station.areaName && ` / ${station.areaName}`}</dd></div>
        <div><dt>Aplikacioni profil</dt><dd>{station.applicationProfileName ?? 'Nije podešen'}</dd></div>
        <div><dt>Gaming Client</dt><dd>{connectivity && <Badge tone={connectivity.tone}>{connectivity.label}</Badge>}</dd></div>
        <div><dt>Client / verzija</dt><dd>{station.clientVersion ?? 'Nije prijavljen'}</dd></div>
        <div><dt>Heartbeat</dt><dd>{station.lastHeartbeatAt ? <time dateTime={station.lastHeartbeatAt}>{formatBusinessDateTime(station.lastHeartbeatAt)}</time> : 'Nema heartbeat-a'}</dd></div>
        <div><dt>Enforcement</dt><dd>{enforcementLabels[station.enforcementStatus]}</dd></div>
        <div><dt>Poslednji lock ACK</dt><dd>{station.lastLockAckAt ? formatBusinessDateTime(station.lastLockAckAt) : 'Nema potvrde'}</dd></div>
        <div><dt>Poslednja komanda</dt><dd>{station.commandType ?? 'Nema komandi'}{station.commandSequence ? ` #${station.commandSequence}` : ''}
          {station.commandSequence ? station.commandAcknowledgedAt ? ' · Potvrđena' : ' · Čeka potvrdu' : ''}</dd></div>
      </dl>
      <StationWarnings station={station} />
      <div className="ops-detail-actions"><StationActions station={station} disabled={disabled} handlers={handlers} /></div>
    </>}
  </aside>
}

export function GamingSessionsTable({ stations, selectedId, now, disabled, onSelect, handlers }: {
  stations: GamingStationCard[]; selectedId: string; now: number; disabled: boolean
  onSelect: (station: GamingStationCard) => void; handlers: StationActionHandlers
}) {
  return <TableShell label="Aktivne sesije na dostupnim stanicama"><table className="ops-session-table">
    <caption className="ops-sr-only">Trenutne sesije iz Gaming Operations Board-a</caption>
    <thead><tr><th scope="col">Računar</th><th scope="col">Klijent</th><th scope="col">Lokacija</th><th scope="col">Početak</th>
      <th scope="col">Planirani kraj</th><th scope="col">Preostalo</th><th scope="col">Status</th><th scope="col">Akcije</th></tr></thead>
    <tbody>{stations.map((station) => {
      const seconds = stationSeconds(station, now)
      return <tr key={station.resourceId} className={selectedId === station.resourceId ? 'ops-session-row--selected' : undefined}>
        <th scope="row"><button type="button" className="ops-table-select" aria-pressed={selectedId === station.resourceId}
          aria-label={`Pregled stanice ${station.resourceName}`} onClick={() => onSelect(station)}><GamingOperationsIcon /><span>{station.resourceName}<small>{station.resourceCode}</small></span></button></th>
        <td>{station.customerDisplayName ?? 'Klijent'}</td><td>{station.locationName ?? '—'}</td>
        <td>{station.startedAt ? <time dateTime={station.startedAt}>{formatBusinessDateTime(station.startedAt)}</time> : '—'}</td>
        <td>{station.endsAt ? <time dateTime={station.endsAt}>{formatBusinessDateTime(station.endsAt)}</time> : '—'}</td>
        <td><strong className={`ops-table-timer${seconds <= 600 ? ' ops-timer--warning' : ''}`}>{stationTimer(seconds)}</strong></td>
        <td><Badge tone={stationTones[station.status]}>{stationLabels[station.status]}</Badge>
          {!!station.commandSequence && !station.commandAcknowledgedAt && <small>Komanda čeka potvrdu</small>}
          {station.staleHeartbeat && <small className="ops-text-danger">Heartbeat zastareo</small>}</td>
        <td><StationActions station={station} disabled={disabled} handlers={handlers} compact /></td>
      </tr>
    })}</tbody>
  </table></TableShell>
}

import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, TableShell } from '../components/ui'
import { permitsStationAction, stationSeconds, stationTimer } from '../gaming/operationsPresentation'
import { ResourceMenu, type ResourceMenuAction } from '../resources/ResourceMenu'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { AuthUser } from '../types/auth.types'
import { connectionStatus, StationIcon, StationIllustration, stationStatus, stationWarnings, type StationTab, type StationView } from './stationPresentation'

export interface StationViewHandlers {
  configurationDisabled: boolean
  administrationDisabled: boolean
  details: (station: StationView, tab?: StationTab, trigger?: HTMLElement) => void
  configure: (station: StationView) => void
  identity: (station: StationView) => void
  employees: (station: StationView) => void
}
export const operationsUrl = (station: StationView) => `/gaming-sessions?stationId=${encodeURIComponent(station.resourceId)}`
export function stationMenuActions(station: StationView, user: AuthUser | null, handlers: StationViewHandlers): ResourceMenuAction[] {
  const actions: ResourceMenuAction[] = [{ label: 'Detalji stanice', onClick: () => handlers.details(station) }]
  if (hasCapability(user, 'STATION_MAINTENANCE')) actions.push({ label: 'Podesi stanicu', onClick: () => handlers.configure(station), disabled: handlers.configurationDisabled })
  if (hasCapability(user, 'MACHINE_IDENTITY_MANAGE')) actions.push({ label: 'Identitet Gaming Client-a', onClick: () => handlers.identity(station), disabled: handlers.administrationDisabled })
  if (hasCapability(user, 'RESOURCE_MANAGE')) actions.push({ label: 'Zaposleni na resursu', onClick: () => handlers.employees(station), disabled: handlers.administrationDisabled })
  if (hasCapability(user, 'GAMING_SESSION_READ') && station.live) actions.push({ label: 'Istorija stanice', onClick: () => handlers.details(station, 'HISTORY') })
  return actions
}
export function StationOperationLinks({ station, user, disabled, compact = false }: { station: StationView; user: AuthUser | null; disabled: boolean; compact?: boolean }) {
  if (!hasCapability(user, 'GAMING_SESSION_READ') || !station.live) return null
  const actions = ([['START', 'Pokreni sesiju'], ['TERMINATE', 'Završi sesiju'], ['EXTEND', 'Produži sesiju'],
    ['FORCE_LOCK', 'Pošalji force-lock'], ['CONFIRM_LOCKED', 'Potvrdi zaključavanje']] as const)
    .filter(([action]) => permitsStationAction(user, station.live!, action))
  const visible = compact ? actions.slice(0, 1) : actions
  return <div className="gm-stations-operation-links">{visible.map(([action, label]) => disabled
    ? <Button key={action} type="button" variant="secondary" disabled>{label}</Button>
    : <Link key={action} to={operationsUrl(station)} className={`gm-stations-operation-link${action === 'TERMINATE' || action === 'FORCE_LOCK' ? ' gm-stations-operation-link--danger' : ''}`}
      title="Otvara izabranu stanicu u Gaming operativi, sa postojećim potvrdama i zaštitama">{label}<span aria-hidden="true">↗</span></Link>)}
    {!compact && <Link to={operationsUrl(station)} className="gm-stations-operation-link gm-stations-operation-link--secondary">Otvori Gaming operativu<span aria-hidden="true">↗</span></Link>}
  </div>
}
function SessionPreview({ station, user, now }: { station: StationView; user: AuthUser | null; now: number }) {
  const live = station.live
  if (!live?.sessionId) return station.activeSessionId ? <div className="gm-stations-session"><span>Stanica ima aktivnu sesiju.</span><small>Detalji nisu dostupni u vašem operativnom opsegu.</small></div>
    : <div className="gm-stations-session gm-stations-session--empty"><span>Nema aktivne sesije</span></div>
  return <div className="gm-stations-session"><div><span>{hasCapability(user, 'CUSTOMER_READ') ? live.customerDisplayName ?? 'Klijent nije dostupan' : 'Aktivna sesija'}</span>
    <strong className={live.status === 'EXPIRED' ? 'gm-stations-timer gm-stations-timer--warning' : 'gm-stations-timer'}>{stationTimer(stationSeconds(live, now))}</strong></div>
    <small>{live.status === 'EXPIRED' ? 'Sesija je istekla' : 'Aktivna sesija'}{live.startedAt && ` · od ${formatBusinessDateTime(live.startedAt, false, 'sr-Latn-RS')}`}</small></div>
}
export function StationCard({ station, user, now, selected, disabled, handlers }: {
  station: StationView; user: AuthUser | null; now: number; selected: boolean; disabled: boolean; handlers: StationViewHandlers
}) {
  const trigger = useRef<HTMLButtonElement>(null), status = stationStatus(station), connection = connectionStatus(station)
  const warnings = stationWarnings(station)
  return <article className={`gm-stations-card${selected ? ' is-selected' : ''}`} onClick={event => {
    if (!(event.target as HTMLElement).closest('button, a, input, label') && trigger.current) handlers.details(station, 'OVERVIEW', trigger.current)
  }}>
    <header><Badge tone={status.tone}>{status.label}</Badge><ResourceMenu label={`Akcije za ${station.resourceName}`}
      actions={stationMenuActions(station, user, handlers)}>⋯</ResourceMenu></header>
    <button ref={trigger} className="gm-stations-card-title" type="button" aria-label={`Detalji stanice ${station.resourceName}`}
      onClick={event => handlers.details(station, 'OVERVIEW', event.currentTarget)}><strong>{station.resourceName}</strong><span>{station.resourceCode}</span></button>
    <StationIllustration />
    <div className="gm-stations-card-location"><span>{station.locationName || 'Lokal nije dostupan'}</span><span>{station.areaName || 'Zona nije dostupna'}</span></div>
    <dl className="gm-stations-card-facts"><div><dt>Profil aplikacija</dt><dd>{station.applicationProfileName || 'Nije dodeljen'}</dd></div>
      <div><dt>Gaming Client</dt><dd><Badge tone={connection.tone}>{connection.label}</Badge>{station.clientVersion && <small>v{station.clientVersion}</small>}</dd></div></dl>
    <SessionPreview station={station} user={user} now={now} />
    {warnings.length > 0 && <div className="gm-stations-card-warnings">{warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
    <footer><Button type="button" variant="secondary" onClick={event => handlers.details(station, 'OVERVIEW', event.currentTarget)}>Detalji</Button>
      <StationOperationLinks station={station} user={user} disabled={disabled} compact /></footer>
  </article>
}
export function StationsTable({ stations, user, now, selectedId, disabled, handlers }: {
  stations: StationView[]; user: AuthUser | null; now: number; selectedId: string; disabled: boolean; handlers: StationViewHandlers
}) {
  return <div className="gm-stations-table-wrap"><TableShell label="Pregled gaming stanica"><table className="gm-stations-table">
    <thead><tr><th scope="col">Stanica</th><th scope="col">Lokal i zona</th><th scope="col">Operativni status</th><th scope="col">Konekcija</th>
      <th scope="col">Profil aplikacija</th><th scope="col">Aktivna sesija</th><th scope="col">Poslednji kontakt</th><th scope="col">Akcije</th></tr></thead>
    <tbody>{stations.map(station => { const status = stationStatus(station), connection = connectionStatus(station)
      return <tr key={station.resourceId} className={selectedId === station.resourceId ? 'is-selected' : undefined}>
        <td data-label="Stanica"><button type="button" className="gm-stations-table-title" onClick={event => handlers.details(station, 'OVERVIEW', event.currentTarget)}><StationIcon />
          <span><strong>{station.resourceName}</strong><small>{station.resourceCode}</small></span></button></td>
        <td data-label="Lokal i zona">{station.locationName || 'Nije dostupan'}<small>{station.areaName || 'Zona nije dostupna'}</small></td>
        <td data-label="Operativni status"><Badge tone={status.tone}>{status.label}</Badge>{stationWarnings(station).map(warning => <small className="gm-stations-table-warning" key={warning}>{warning}</small>)}</td>
        <td data-label="Konekcija"><Badge tone={connection.tone}>{connection.label}</Badge></td>
        <td data-label="Profil aplikacija">{station.applicationProfileName || 'Nije dodeljen'}</td>
        <td data-label="Aktivna sesija"><SessionPreview station={station} user={user} now={now} /></td>
        <td data-label="Poslednji kontakt">{station.lastHeartbeatAt ? <time dateTime={station.lastHeartbeatAt}>{formatBusinessDateTime(station.lastHeartbeatAt, false, 'sr-Latn-RS')}</time> : 'Nema kontakta'}</td>
        <td data-label="Akcije"><div className="gm-stations-table-actions"><Button type="button" variant="secondary" onClick={event => handlers.details(station, 'OVERVIEW', event.currentTarget)}>Detalji</Button>
          <ResourceMenu label={`Akcije za ${station.resourceName}`} actions={stationMenuActions(station, user, handlers)}>⋯</ResourceMenu>
          <StationOperationLinks station={station} user={user} disabled={disabled} compact /></div></td>
      </tr>
    })}</tbody>
  </table></TableShell></div>
}

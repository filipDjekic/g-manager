import { type StationViewHandlers, operationsUrl, stationMenuActions } from './StationViews.model'
import { Link } from 'react-router-dom'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, TableShell } from '../components/ui'
import { permitsStationAction, stationSeconds, stationTimer } from '../gaming/operationsPresentation'
import { ResourceMenu } from '../resources/ResourceMenu'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { AuthUser } from '../types/auth.types'
import { StationIcon } from './stationPresentation'
import { connectionStatus, stationStatus, stationWarnings, isNewerClientVersion, type StationView } from './stationPresentation.model'
export function StationOperationLinks({ station, user, disabled, compact = false }: { station: StationView; user: AuthUser | null; disabled: boolean; compact?: boolean }) {
  if (!hasCapability(user, 'GAMING_SESSION_READ') || !station.live) return null
  const actions = ([['START', 'Dodeli računar'], ['TERMINATE', 'Završi sesiju'], ['EXTEND', 'Dodaj vreme'],
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
export function StationsTable({ stations, user, now, selectedId, disabled, handlers }: {
  stations: StationView[]; user: AuthUser | null; now: number; selectedId: string; disabled: boolean; handlers: StationViewHandlers
}) {
  return <TableShell label="Pregled gaming stanica" className="gm-stations-table-wrap"><table className="ui-data-table gm-stations-table">
    <thead><tr><th scope="col">Stanica</th><th scope="col">Lokal i zona</th><th scope="col">Operativni status</th><th scope="col">Konekcija</th>
      <th scope="col">Profil aplikacija</th><th scope="col">Aktivna sesija</th><th scope="col">Poslednji kontakt</th><th scope="col">Akcije</th></tr></thead>
    <tbody>{stations.map(station => { const status = stationStatus(station), connection = connectionStatus(station), warnings = stationWarnings(station)
      return <tr key={station.resourceId} className={selectedId === station.resourceId ? 'is-selected' : undefined}
        onClick={event => {
          if (!(event.target as HTMLElement).closest('button, a, input, select, [role="menu"]')) {
            handlers.details(station, 'OVERVIEW', event.currentTarget.querySelector<HTMLButtonElement>('.gm-stations-table-title') ?? undefined)
          }
        }}>
        <td data-label="Stanica"><Button variant="ghost" type="button" className="gm-stations-table-title" aria-haspopup="dialog" aria-label={`Detalji stanice ${station.resourceName}`} onClick={event => handlers.details(station, 'OVERVIEW', event.currentTarget)}><StationIcon />
          <span><strong>{station.resourceName}</strong><small>{station.resourceCode}</small></span></Button></td>
        <td data-label="Lokal i zona">{station.locationName || 'Nije dostupan'}<small>{station.areaName || 'Zona nije dostupna'}</small></td>
        <td data-label="Operativni status"><Badge tone={status.tone}>{status.label}</Badge>{warnings.length > 0 && <small className="gm-stations-table-warning" title={warnings.join('\n')}>Upozorenja: {warnings.length}</small>}</td>
        <td data-label="Konekcija"><Badge tone={connection.tone}>{connection.label}</Badge><small>{station.clientVersion || 'Verzija nije prijavljena'}</small>{isNewerClientVersion(station.availableClientVersion, station.clientVersion) && <Badge tone="warning">Dostupno v{station.availableClientVersion}</Badge>}</td>
        <td data-label="Profil aplikacija">{station.applicationProfileName || 'Nije dodeljen'}</td>
        <td data-label="Aktivna sesija"><SessionPreview station={station} user={user} now={now} /></td>
        <td data-label="Poslednji kontakt">{station.lastHeartbeatAt ? <time dateTime={station.lastHeartbeatAt}>{formatBusinessDateTime(station.lastHeartbeatAt, false, 'sr-Latn-RS')}</time> : 'Nema kontakta'}</td>
        <td data-label="Akcije"><div className="gm-stations-table-actions"><Button type="button" size="small" variant="secondary" onClick={event => handlers.details(station, 'OVERVIEW', event.currentTarget)}>Detalji</Button>
          <ResourceMenu label={`Akcije za ${station.resourceName}`} actions={stationMenuActions(station, user, handlers)}>⋯</ResourceMenu>
          <StationOperationLinks station={station} user={user} disabled={disabled} compact /></div></td>
      </tr>
    })}</tbody>
  </table></TableShell>
}

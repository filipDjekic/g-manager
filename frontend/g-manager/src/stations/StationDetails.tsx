import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState, type RefObject } from 'react'
import { hasCapability } from '../auth/capabilities'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { Badge, Button, Drawer, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { enforcementLabels } from '../gaming/presentation'
import { stationSeconds, stationTimer } from '../gaming/operationsPresentation'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { AuthUser } from '../types/auth.types'
import type { ApplicationDefinition, ApplicationProfile } from '../types/station.types'
import { StationOperationLinks, type StationViewHandlers } from './StationViews'
import { applicationTypeLabels, connectionStatus, operationalLabels, StationIllustration, stationError, stationStatus, stationWarnings, type StationTab, type StationView } from './stationPresentation'

const tabs: Array<[StationTab, string]> = [['OVERVIEW', 'Pregled'], ['CONFIGURATION', 'Konfiguracija'], ['APPLICATIONS', 'Aplikacije'], ['HISTORY', 'Istorija']]
const actionLabels: Record<string, string> = { SESSION_STARTED: 'Pokretanje sesije', SESSION_EXTENDED: 'Produženje sesije', SESSION_TERMINATED: 'Završavanje sesije', FORCE_LOCK: 'Prinudno zaključavanje', OPERATOR_RECOVERY: 'Fizička potvrda zaključavanja' }
const historyStatusLabels: Record<string, string> = { PENDING: 'Čeka potvrdu', ACKNOWLEDGED: 'Potvrđena', ...enforcementLabels }
export function StationDetails({ station, user, now, initialTab, profiles, definitions, applicationLoading, applicationError, stale, returnFocusRef, handlers, onClose, onRefresh }: {
  station: StationView; user: AuthUser | null; now: number; initialTab: StationTab; profiles: ApplicationProfile[]; definitions: ApplicationDefinition[]
  applicationLoading: boolean; applicationError: unknown; stale: boolean; returnFocusRef: RefObject<HTMLElement | null>
  handlers: StationViewHandlers; onClose: () => void; onRefresh: () => void
}) {
  const [tab, setTab] = useState<StationTab>(initialTab), id = useId()
  useEffect(() => { setTab(initialTab) }, [initialTab, station.resourceId])
  const canHistory = hasCapability(user, 'GAMING_SESSION_READ') && Boolean(station.live)
  const history = useQuery({ queryKey: ['gaming-operations', 'history', station.resourceId], queryFn: () => gamingSessionApi.history(station.resourceId), enabled: canHistory && tab === 'HISTORY' })
  const profile = profiles.find(value => value.id === station.applicationProfileId), live = station.live
  const status = stationStatus(station), connection = connectionStatus(station), warnings = stationWarnings(station)
  const date = (value?: string) => value ? formatBusinessDateTime(value, false, 'sr-Latn-RS') : 'Nije zabeleženo'
  return <Drawer open size="wide" title={station.resourceName} className="gm-stations-drawer" onClose={onClose} returnFocusRef={returnFocusRef}>
    <div className="gm-stations-details">
      <div className="gm-stations-details-scroll">
        <div className="gm-stations-details-hero"><Badge tone={status.tone}>{status.label}</Badge><span>{station.resourceCode}</span>
          <p>{station.locationName || 'Lokal nije dostupan'} · {station.areaName || 'Zona nije dostupna'}</p></div>
        {stale && <div className="gm-stations-warning" role="status">Podaci mogu biti zastareli. Osvežite pre operativnih ili konfiguracionih promena.
          <Button type="button" variant="secondary" onClick={onRefresh}>Osveži podatke</Button></div>}
        <div className="gm-stations-detail-tabs" role="tablist" aria-label="Detalji gaming stanice">{tabs.map(([value, label], index) =>
          <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-selected={tab === value} aria-controls={`${id}-panel`} tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
              setTab(tabs[next][0]); document.getElementById(`${id}-${tabs[next][0]}`)?.focus()
            } }}>{label}</button>)}</div>
        <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} tabIndex={0}>
          {tab === 'OVERVIEW' && <>
            <StationIllustration />
            <dl className="gm-stations-detail-fields">
              <div><dt>Naziv</dt><dd>{station.resourceName}</dd></div><div><dt>Kod</dt><dd>{station.resourceCode}</dd></div>
              <div><dt>Lokal</dt><dd>{station.locationName || 'Nije dostupan'}</dd></div><div><dt>Zona</dt><dd>{station.areaName || 'Nije dostupna'}</dd></div>
              <div><dt>Operativno stanje</dt><dd>{operationalLabels[station.operationalStatus]}</dd></div>
              <div><dt>Efektivno stanje</dt><dd>{station.effectiveStatus === 'IN_SESSION' ? 'U sesiji' : operationalLabels[station.effectiveStatus as keyof typeof operationalLabels] ?? 'Bez veze'}</dd></div>
              <div><dt>Gaming Client konekcija</dt><dd><Badge tone={connection.tone}>{connection.label}</Badge></dd></div>
              <div><dt>Poslednji heartbeat</dt><dd>{date(station.lastHeartbeatAt)}{live?.staleHeartbeat && <small>Heartbeat je zastareo</small>}</dd></div>
              <div><dt>Verzija klijenta</dt><dd>{station.clientVersion || 'Nije prijavljena'}</dd></div>
              <div><dt>Potvrda zaključavanja</dt><dd>{live ? enforcementLabels[live.enforcementStatus] ?? live.enforcementStatus : 'Operativni podatak nije dostupan'}</dd></div>
              {live?.lastLockAckAt && <div><dt>Poslednja potvrda zaključavanja</dt><dd>{date(live.lastLockAckAt)}</dd></div>}
              {Boolean(live?.commandSequence) && <div className="gm-stations-full"><dt>Poslednja komanda</dt><dd>{actionLabels[live?.commandType ?? ''] ?? live?.commandType ?? 'Komanda'} #{live?.commandSequence} · {live?.commandAcknowledgedAt ? 'Potvrđena' : 'Čeka potvrdu'}<small>{date(live?.commandAvailableAt)}</small></dd></div>}
            </dl>
            {warnings.length > 0 && <div className="gm-stations-detail-warnings">{warnings.map(warning => <p className="gm-stations-warning" key={warning}>{warning}</p>)}</div>}
            {live?.sessionId ? <div className="gm-stations-detail-session"><h3>{live.status === 'EXPIRED' ? 'Sesija je istekla' : 'Aktivna sesija'}</h3>
              {hasCapability(user, 'CUSTOMER_READ') && <strong>{live.customerDisplayName ?? 'Klijent nije dostupan'}</strong>}
              <div><span>Preostalo vreme</span><strong className="gm-stations-timer">{stationTimer(stationSeconds(live, now))}</strong></div>
              <dl><div><dt>Početak</dt><dd>{date(live.startedAt)}</dd></div><div><dt>Planirani kraj</dt><dd>{date(live.endsAt)}</dd></div></dl>
            </div> : <p className="gm-stations-form-note">{station.activeSessionId ? 'Stanica ima aktivnu sesiju. Detalji nisu dostupni u vašem operativnom opsegu.' : 'Nema aktivne sesije.'}</p>}
          </>}
          {tab === 'CONFIGURATION' && <>
            <dl className="gm-stations-detail-fields"><div><dt>Operativno stanje</dt><dd>{operationalLabels[station.operationalStatus]}</dd></div>
              <div><dt>Profil aplikacija</dt><dd>{station.applicationProfileName || 'Nije dodeljen'}</dd></div>
              <div><dt>Gaming Client integracija</dt><dd>{station.clientEnabled ? 'Uključena' : 'Isključena · ručni režim'}</dd></div>
              <div><dt>Interval heartbeat-a</dt><dd>{station.heartbeatIntervalSeconds} s</dd></div>
              <div><dt>Tolerancija prekida veze</dt><dd>{station.offlineGraceSeconds} s</dd></div>
              <div><dt>Konfiguraciona verzija</dt><dd>v{station.configurationVersion}</dd></div></dl>
            {hasCapability(user, 'STATION_MAINTENANCE') && <Button type="button" className="gm-stations-detail-configure" variant="secondary" disabled={handlers.configurationDisabled} onClick={() => handlers.configure(station)}>Podesi stanicu</Button>}
          </>}
          {tab === 'APPLICATIONS' && (applicationLoading ? <Skeleton lines={4} label="Učitavanje profila i aplikacija" /> : applicationError
            ? <ErrorState message={stationError(applicationError, 'Profil i aplikacije nisu dostupni.')} action={<Button type="button" onClick={onRefresh}>Pokušaj ponovo</Button>} />
            : !profile ? <EmptyState title="Profil aplikacija nije dostupan" description="Dodelite aktivan profil u podešavanjima stanice." />
            : <div className="gm-stations-detail-applications"><header><h3>{profile.name}</h3><Badge tone={profile.active ? 'success' : 'neutral'}>{profile.active ? 'Aktivan' : 'Neaktivan'}</Badge><p>{profile.code} · Konfiguracija v{profile.configurationVersion}</p>{profile.description && <p>{profile.description}</p>}</header>
              <p className="gm-stations-form-note">Dozvoljene aplikacije ovog profila. Ovaj prikaz ne potvrđuje koji se procesi trenutno izvršavaju.</p>
              {[...profile.entries].sort((a, b) => a.launchOrder - b.launchOrder).map(entry => { const definition = definitions.find(value => value.id === entry.applicationDefinitionId)
                return <article key={entry.id}><h4>{entry.applicationName}</h4><Badge>{applicationTypeLabels[entry.applicationType]}</Badge>
                  <dl><div><dt>Obavezan proces</dt><dd>{entry.requiredProcess ? 'Da' : 'Ne'}</dd></div><div><dt>Automatsko pokretanje</dt><dd>{entry.autoStart ? 'Da' : 'Ne'}</dd></div>
                    <div><dt>Redosled pokretanja</dt><dd>{entry.launchOrder}</dd></div><div><dt>Grupa zavisnosti</dt><dd>{entry.dependencyGroup || 'Samostalno'}</dd></div>
                    {definition && <div className="gm-stations-full"><dt>Izvršna datoteka</dt><dd><code>{definition.executablePath}</code></dd></div>}
                    {entry.argumentsOverride && <div className="gm-stations-full"><dt>Argumenti profila</dt><dd><code>{entry.argumentsOverride}</code></dd></div>}</dl>
                </article>
              })}
            </div>)}
          {tab === 'HISTORY' && (!canHistory ? <EmptyState title="Istorija nije dostupna" description="Istorija je dostupna samo za stanice u vašem Gaming Operations opsegu." />
            : history.isLoading ? <Skeleton lines={5} label="Učitavanje istorije stanice" /> : history.isError ? <ErrorState message={stationError(history.error, 'Istoriju nije moguće učitati.')} action={<Button type="button" onClick={() => history.refetch()}>Pokušaj ponovo</Button>} />
              : !history.data?.entries.length ? <EmptyState title="Nema zabeleženih događaja" description="Komande i promene potvrde zaključavanja prikazivaće se ovde." />
                : <div className="gm-stations-history"><p className="gm-stations-form-note">Poslednji zabeleženi događaji · osveženo {date(history.data.serverTime)}</p>
                  {history.data.entries.map((entry, index) => <article key={`${entry.category}-${entry.occurredAt}-${index}`}><div><strong>{actionLabels[entry.action] ?? entry.action}</strong>
                    <Badge tone={entry.status === 'PENDING' ? 'warning' : entry.status === 'OFFLINE' ? 'danger' : 'neutral'}>{historyStatusLabels[entry.status] ?? entry.status}</Badge></div>
                    <time dateTime={entry.occurredAt}>{date(entry.occurredAt)}</time><small>{entry.category === 'COMMAND' ? 'Komanda' : 'Potvrda zaključavanja'}{entry.commandSequence ? ` · #${entry.commandSequence}` : ''}</small>
                    {entry.details && <p>{entry.details}</p>}{entry.correlationId && <small>ID praćenja: <code>{entry.correlationId}</code></small>}</article>)}
                </div>)}
        </section>
      </div>
      <footer className="gm-stations-details-actions"><StationOperationLinks station={station} user={user} disabled={stale} />
        {(hasCapability(user, 'MACHINE_IDENTITY_MANAGE') || hasCapability(user, 'RESOURCE_MANAGE')) && <div>
          {hasCapability(user, 'MACHINE_IDENTITY_MANAGE') && <Button type="button" variant="secondary" disabled={handlers.administrationDisabled} onClick={() => handlers.identity(station)}>Identitet klijenta</Button>}
          {hasCapability(user, 'RESOURCE_MANAGE') && <Button type="button" variant="secondary" disabled={handlers.administrationDisabled} onClick={() => handlers.employees(station)}>Zaposleni</Button>}</div>}
      </footer>
    </div>
  </Drawer>
}

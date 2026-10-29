import { Badge, Button } from '../components/ui'
import { hasCapability } from '../auth/capabilities'
import type { AuthUser } from '../types/auth.types'
import type { StationViewHandlers } from './StationViews.model'
import type { StationView } from './stationPresentation.model'

export function StationSetupSteps({ station, user, handlers }: { station: StationView; user: AuthUser | null; handlers: StationViewHandlers }) {
  if (!hasCapability(user, 'STATION_MAINTENANCE')) return null
  const candidate = station.live?.allowedActions.includes('START')
  return <section className="ui-secondary-section" aria-label="Priprema PC stanice"><h3>Priprema računara</h3>
    <ol className="ui-task-list">
      <li><strong>1. Resurs je dodat</strong><small>{station.resourceCode} · {station.resourceName}</small></li>
      <li><strong>2. Profil i konfiguracija</strong><span>{station.applicationProfileName || 'Dodelite aktivan profil sa dozvoljenim aplikacijama.'}</span>
        <Button variant="secondary" disabled={handlers.configurationDisabled} onClick={() => handlers.configure(station)}>Podesi profil i Client</Button></li>
      <li><strong>3. Instalacija i povezivanje</strong><span>{station.clientEnabled ? 'Client integracija je uključena. Proverite upis, identitet i Windows politiku.' : 'Ručni režim. Za upravljanje klijentom uključite Client integraciju u konfiguraciji.'}</span>
        {hasCapability(user,'MACHINE_IDENTITY_MANAGE') && <Button variant="secondary" disabled={handlers.administrationDisabled} onClick={() => handlers.identity(station)}>Upis i identitet klijenta</Button>}</li>
      <li><strong>4. Provera spremnosti</strong><Badge tone={candidate ? 'success' : 'warning'}>{candidate ? 'Kandidat za pokretanje' : 'Proverite stanje na Radnom ekranu'}</Badge>
        <small>Pravo upravljanja, aktivan profil, autentifikacija, politika i svež kontakt proveravaju se na serveru. Pokretanje dodatno proverava ceo interval.</small></li>
    </ol>
    {hasCapability(user,'RESOURCE_MANAGE') && <p>Novi računar ne nasleđuje prethodnu dodelu lokacije. Proverite zaposlene na ovom resursu.
      <Button variant="secondary" disabled={handlers.administrationDisabled} onClick={() => handlers.employees(station)}>Proveri dodele</Button></p>}
  </section>
}

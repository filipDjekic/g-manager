import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { resourceApi } from '../api/resourceApi'
import { stationApi } from '../api/stationApi'
import { catalogApi } from '../api/catalogApi'
import { Badge, Button, Card } from '../components/ui'
import type { WorkingHours } from '../types/workingHours.types'
import type { UserResponse } from '../types/user.types'
import { SettingsIcon } from './settingsPresentation'
import { type SettingsIconKind } from './settingsPresentation.model'
import { useClientPackageAvailability } from '../stations/clientPackageDistribution'

type SetupStep = { label: string; description: string; detail: string; icon: SettingsIconKind; ready: boolean; known: boolean; error: unknown
  retry?: () => unknown; to: string; tab?: 'hours' | 'exceptions'; permitted: boolean }
export function SetupOverview({ hours, employees, exceptions, timeOff, onOpenTab }: {
  hours: UseQueryResult<WorkingHours[]>; employees: UseQueryResult<UserResponse[]>; exceptions: UseQueryResult<{ totalElements: number }>
  timeOff: UseQueryResult<{ totalElements: number }>; onOpenTab: (tab: 'hours' | 'exceptions') => void
}) {
  const actor = useAuthStore(state => state.user)
  const canResources = hasCapability(actor, 'RESOURCE_READ'), canStations = hasCapability(actor, 'STATION_READ')
  const locations = useQuery({ queryKey: ['setup', 'locations'], queryFn: resourceApi.locations, enabled: canResources, staleTime: 300000 })
  const stations = useQuery({ queryKey: ['stations', 'overview'], queryFn: stationApi.overview, enabled: canStations })
  const profiles = useQuery({ queryKey: ['stations', 'profiles'], queryFn: stationApi.profiles, enabled: canStations })
  const services = useQuery({ queryKey: ['setup', 'services'], queryFn: () => catalogApi.list({ page: 0, size: 1, type: 'SERVICE', active: true, sort: 'name', direction: 'ASC' }),
    enabled: hasCapability(actor, 'CATALOG_READ') })
  const distribution = useQuery({ queryKey: ['stations', 'client-package'], queryFn: stationApi.clientPackage, enabled: canStations, staleTime: 300000 })
  const clientPackage = useClientPackageAvailability(canStations && !distribution.error ? distribution.data : undefined)
  const active = locations.data?.find(item => item.active)
  const areas = useQuery({ queryKey: ['setup', 'areas', active?.id], queryFn: () => resourceApi.areas(active!.id), enabled: !!active })
  const configuredStations = stations.data?.filter(item => item.stationProfileId && item.applicationProfileId).length ?? 0
  const released = clientPackage.ready && !clientPackage.checking
  const futureExceptions = exceptions.data?.totalElements ?? 0
  const relevantTimeOff = timeOff.data?.totalElements ?? 0
  const configuration: SetupStep[] = [
    { label: 'Lokacije', description: 'Adresa i poslovna zona aktivne lokacije.', detail: `${locations.data?.filter(item => item.active).length ?? 0} aktivnih lokacija`,
      icon: 'building', ready: !!active, known: !!locations.data, error: locations.error, retry: locations.refetch, to: '/resources', permitted: canResources },
    { label: 'Zone', description: active ? `Provera prve aktivne lokacije: ${active.name}.` : 'Organizujte prostor i mapu resursa.',
      detail: `${areas.data?.filter(item => item.active).length ?? 0} aktivnih zona`, icon: 'layers', ready: !!areas.data?.some(item => item.active),
      known: !!areas.data || !!locations.data && !active, error: locations.error || areas.error,
      retry: locations.error ? locations.refetch : areas.refetch, to: '/resources', permitted: canResources },
    { label: 'Gaming stanice', description: 'Povežite fizičke resurse sa staničnim i aplikacionim profilom.',
      detail: `${configuredStations} / ${stations.data?.length ?? 0} stanica sa profilima`, icon: 'monitor', ready: configuredStations > 0, known: !!stations.data,
      error: stations.error, retry: stations.refetch, to: '/stations', permitted: canStations },
    { label: 'Zaposleni', description: 'Aktivni nalozi i dodele resursa u Mapi resursa.', detail: `${employees.data?.filter(item => item.active).length ?? 0} aktivnih zaposlenih`,
      icon: 'users', ready: !!employees.data?.some(item => item.active), known: !!employees.data, error: employees.error, retry: employees.refetch,
      to: '/employees', permitted: hasCapability(actor, 'USER_LIST') },
    { label: 'Radno vreme', description: 'Standardni nedeljni raspored igraonice.', detail: `${hours.data?.filter(item => item.active).length ?? 0} aktivnih dana u nedelji`,
      icon: 'clock', ready: !!hours.data?.some(item => item.active), known: !!hours.data, error: hours.error, retry: hours.refetch,
      to: '#working-hours', tab: 'hours', permitted: hasCapability(actor, 'WORKING_HOURS_READ') },
    { label: 'Izuzeci', description: 'Posebni datumi i izmene standardnog radnog vremena.', detail: `${futureExceptions} budućih izuzetaka · opciono podešavanje`,
      icon: 'calendar', ready: !!exceptions.data, known: !!exceptions.data, error: exceptions.error, retry: exceptions.refetch,
      to: '#exceptions', tab: 'exceptions', permitted: hasCapability(actor, 'WORKING_HOURS_READ') },
    { label: 'Usluge', description: 'Aktivne usluge dostupne u katalogu.', detail: `${services.data?.totalElements ?? 0} aktivnih usluga`,
      icon: 'gamepad', ready: !!services.data?.totalElements, known: !!services.data, error: services.error, retry: services.refetch,
      to: '/catalog', permitted: hasCapability(actor, 'CATALOG_READ') },
    { label: 'Aplikacioni profili', description: 'Definišite dozvoljene igre i aplikacije.', detail: `${profiles.data?.filter(item => item.active).length ?? 0} aktivnih profila`,
      icon: 'package', ready: !!profiles.data?.some(item => item.active && item.entries.length), known: !!profiles.data, error: profiles.error,
      retry: profiles.refetch, to: '/stations', permitted: canStations },
    { label: 'Odsustva zaposlenih', description: 'Aktuelni i budući zahtevi i odobrena odsustva.', detail: `${relevantTimeOff} relevantnih odsustava`,
      icon: 'calendar', ready: !!timeOff.data, known: !!timeOff.data, error: timeOff.error, retry: timeOff.refetch,
      to: '/employee-time-off', permitted: hasCapability(actor, 'WORKING_HOURS_MANAGE') },
    { label: 'Gaming Client paket', description: 'Produkcijska objava, preuzimanje i SHA-256 kontrolna suma.',
      detail: clientPackage.checking ? 'Provera dostupnosti paketa…' : clientPackage.message || (distribution.data?.version ? `Verzija ${distribution.data.version}` : 'Provera produkcijskog paketa'), icon: 'client',
      ready: released, known: !!distribution.data && clientPackage.known && !clientPackage.checking, error: distribution.error || clientPackage.error,
      retry: () => { void distribution.refetch(); if (clientPackage.url) void clientPackage.refetch() }, to: '/stations', permitted: canStations },
  ]
  const steps = configuration.filter(step => step.permitted)
  const complete = steps.filter(step => step.ready && !step.error).length
  const labels: Record<string, string> = { '/resources': 'Otvori lokacije', '/employees': 'Otvori zaposlene', '/catalog': 'Otvori usluge', '/employee-time-off': 'Otvori odsustva' }
  return <Card className="gm-settings-section">
    <header className="gm-settings-section-header"><div><h2>Pregled konfiguracije</h2><p>Status najvažnijih podešavanja vaše igraonice.</p></div>
      <Badge tone="info">{complete} / {steps.length} provera</Badge></header>
    <div className="gm-settings-overview-grid">{steps.map(step => <Card as="article" key={step.label} className={`gm-settings-setup-card${step.ready && !step.error ? ' is-ready' : ''}`}>
      <header><span className="gm-settings-setup-icon"><SettingsIcon kind={step.icon} /></span>
        <Badge tone={step.error ? 'danger' : !step.known ? 'neutral' : step.ready ? 'success' : 'warning'}>
          {step.error ? 'Greška pri učitavanju' : !step.known ? 'U proveri' : step.ready ? 'Podešeno' : 'Potrebna konfiguracija'}</Badge></header>
      <h3>{step.label}</h3><p>{step.description}</p><small>{step.error ? 'Podatke nije moguće potvrditi.' : step.known ? step.detail : 'Učitavanje podataka…'}</small>
      <footer>{Boolean(step.error) && <Button type="button" variant="secondary" onClick={() => void step.retry?.()}>Ponovi proveru</Button>}
        {step.tab ? <Button type="button" variant="secondary" onClick={() => onOpenTab(step.tab!)}>Otvori {step.tab === 'hours' ? 'radno vreme' : 'izuzetke'}</Button>
          : <Link className="ui-button ui-button--secondary ui-button--medium" to={step.to}>{step.label === 'Zone' ? 'Otvori zone' : step.label === 'Aplikacioni profili' ? 'Otvori profile' : step.to === '/stations' ? 'Otvori stanice' : labels[step.to]}</Link>}</footer>
    </Card>)}</div>
    <p className="gm-settings-note">Provere su informativne. Za svaku lokaciju proverite njene zone, profile stanica i vezu Gaming Client-a.</p>
    {hasCapability(actor, 'PROFILE_READ') && <nav className="gm-settings-related" aria-label="Povezana podešavanja naloga"><Link to="/notification-preferences">Podešavanja obaveštenja</Link><Link to="/sessions">Bezbednost naloga</Link></nav>}
  </Card>
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { stationApi } from '../api/stationApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, EmptyState, ErrorState, Input, Select, Skeleton } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { GamingBoardPagination, readGamingPage } from '../gaming/GamingBoardPagination'
import { permitsStationAction } from '../gaming/operationsPresentation'
import { stationLabels } from '../gaming/presentation'
import { useGamingOperations } from '../gaming/useGamingOperations'
import { useServerNow } from '../gaming/useServerNow'
import { useListUrlState } from '../lists/useListUrlState'
import { ResourceEmployees } from '../resources/ResourceEmployees'
import { formatBusinessDateTime } from '../reservations/dateTime'
import { StationAdministration, StationClientPackage } from '../stations/StationAdministration'
import { ApplicationDialog, ApplicationProfileDialog, StationConfigurationDialog } from '../stations/StationConfigurationDialogs'
import { StationDetails } from '../stations/StationDetails'
import { StationIdentityDialog } from '../stations/StationIdentityDialog'
import { StationCard, StationsTable, type StationViewHandlers } from '../stations/StationViews'
import { connectionStatus, problematicStation, StationIcon, stationError, stationStatus, type StationTab, type StationView } from '../stations/stationPresentation'
import type { ApplicationDefinition, ApplicationProfile, StationOverview } from '../types/station.types'
import '../stations/stations.css'

const defaults = { search: '', status: '', locationId: '', areaId: '', profileId: '', connection: '', view: 'cards', page: '1', size: '9', stationId: '' }
const urlKeys = Object.keys(defaults) as Array<keyof typeof defaults>
const connections = { CONNECTED: 'Povezan', OFFLINE: 'Bez veze', WAITING: 'Čeka prvi kontakt', MANUAL: 'Ručni režim', UNKNOWN: 'Veza nije potvrđena' }
const pageSizes = [9, 18, 36]

export function StationsPage() {
  const user = useAuthStore(state => state.user), client = useQueryClient(), toast = useToast()
  const canRead = hasCapability(user, 'STATION_READ'), canOperate = canRead && hasCapability(user, 'GAMING_SESSION_READ')
  const manage = hasCapability(user, 'APPLICATION_PROFILE_MANAGE'), maintain = hasCapability(user, 'STATION_MAINTENANCE')
  const machineManage = hasCapability(user, 'MACHINE_IDENTITY_MANAGE'), resourceManage = hasCapability(user, 'RESOURCE_MANAGE')
  const operations = useGamingOperations(canOperate), board = operations.board
  const now = useServerNow(canOperate ? board.data?.serverTime : undefined)
  const stations = useQuery({ queryKey: ['stations', 'overview', user?.id], queryFn: stationApi.overview, enabled: canRead,
    refetchInterval: operations.visible && (!canOperate || board.isError) ? 15000 : false, refetchIntervalInBackground: false })
  const definitions = useQuery({ queryKey: ['stations', 'applications', user?.id], queryFn: stationApi.definitions, enabled: canRead })
  const profiles = useQuery({ queryKey: ['stations', 'profiles', user?.id], queryFn: stationApi.profiles, enabled: canRead })
  const clientPackage = useQuery({ queryKey: ['stations', 'client-package', user?.id], queryFn: stationApi.clientPackage, enabled: canRead })
  // The existing board owns SSE and polling. Its fresh snapshots also refresh station configuration/heartbeat metadata.
  useEffect(() => { if (canOperate && board.dataUpdatedAt) void client.invalidateQueries({ queryKey: ['stations', 'overview'] }) }, [canOperate, board.dataUpdatedAt, client])
  const url = useListUrlState(defaults, urlKeys), state = url.state
  const [search, setSearch] = useState(state.search), [moreFilters, setMoreFilters] = useState(Boolean(state.profileId || state.connection))
  const [stationEdit, setStationEdit] = useState<StationOverview | null>(null), [machineStation, setMachineStation] = useState<StationOverview | null>(null)
  const [resourceEmployees, setResourceEmployees] = useState<StationOverview | null>(null)
  const [definitionEdit, setDefinitionEdit] = useState<ApplicationDefinition | null | undefined>(undefined)
  const [profileEdit, setProfileEdit] = useState<ApplicationProfile | null | undefined>(undefined)
  const [detailTab, setDetailTab] = useState<StationTab>('OVERVIEW'), [deleting, setDeleting] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null), detailOpener = useRef<HTMLElement | null>(null), deleteInFlight = useRef(false)
  const { confirm, confirmationDialog } = useConfirmDialog()
  useEffect(() => { setSearch(state.search) }, [state.search])
  const setUrl = url.set
  useEffect(() => {
    if (search === state.search) return
    const timer = window.setTimeout(() => setUrl({ search, page: '1' }, true), 300)
    return () => window.clearTimeout(timer)
  }, [search, state.search, setUrl])

  const allStations = useMemo<StationView[]>(() => {
    const liveById = new Map((canOperate ? board.data?.stations ?? [] : []).map(value => [value.resourceId, value]))
    return (stations.data ?? []).map<StationView>(value => {
      const live = liveById.get(value.resourceId)
      return { ...value, live, locationName: value.locationName ?? live?.locationName, areaName: value.areaName ?? live?.areaName,
        operationalStatus: live?.operationalStatus === 'AVAILABLE' || live?.operationalStatus === 'MAINTENANCE' || live?.operationalStatus === 'RETIRED' ? live.operationalStatus : value.operationalStatus,
        effectiveStatus: live?.effectiveStatus === 'AVAILABLE' || live?.effectiveStatus === 'MAINTENANCE' || live?.effectiveStatus === 'RETIRED' || live?.effectiveStatus === 'IN_SESSION' || live?.effectiveStatus === 'OFFLINE' ? live.effectiveStatus : value.effectiveStatus,
        // Live session absence clears an older overview snapshot after termination.
        activeSessionId: live ? live.sessionId : value.activeSessionId, lastHeartbeatAt: live ? live.lastHeartbeatAt : value.lastHeartbeatAt,
        clientVersion: live?.clientVersion ?? value.clientVersion, clientEnabled: live?.clientEnabled ?? value.clientEnabled }
    }).sort((a, b) => a.resourceName.localeCompare(b.resourceName, 'sr-Latn-RS', { numeric: true }))
  }, [stations.data, board.data, canOperate])
  const locations = useMemo(() => [...new Map(allStations.map(value => [value.locationId, value.locationName || value.locationId])).entries()], [allStations])
  const areas = useMemo(() => [...new Map(allStations.filter(value => !state.locationId || value.locationId === state.locationId)
    .map(value => [value.areaId, value.areaName || value.areaId])).entries()], [allStations, state.locationId])
  useEffect(() => {
    if (stations.data && !stations.isError && state.areaId && !areas.some(([id]) => id === state.areaId)) setUrl({ areaId: '', page: '1' }, true)
  }, [areas, stations.data, stations.isError, state.areaId, setUrl])
  const filtered = useMemo(() => {
    const term = state.search.trim().toLocaleLowerCase('sr-Latn-RS')
    return allStations.filter(value => (!term || [value.resourceName, value.resourceCode,
      hasCapability(user, 'CUSTOMER_READ') && value.live?.sessionId ? value.live.customerDisplayName : ''].some(text => text?.toLocaleLowerCase('sr-Latn-RS').includes(term)))
      && (!state.status || stationStatus(value).value === state.status) && (!state.locationId || value.locationId === state.locationId)
      && (!state.areaId || value.areaId === state.areaId) && (!state.profileId || (state.profileId === 'none' ? !value.applicationProfileId : value.applicationProfileId === state.profileId))
      && (!state.connection || connectionStatus(value).key === state.connection))
  }, [allStations, state, user])
  const pageSize = pageSizes.includes(Number(state.size)) ? Number(state.size) : 9
  const page = Math.min(readGamingPage(state.page), Math.max(0, Math.ceil(filtered.length / pageSize) - 1))
  useEffect(() => { if (stations.data && state.page !== String(page + 1)) setUrl({ page: String(page + 1) }, true) }, [stations.data, state.page, page, setUrl])
  const current = filtered.slice(page * pageSize, (page + 1) * pageSize), selected = allStations.find(value => value.resourceId === state.stationId)
  const operationalStations = allStations.filter(value => value.live)
  const operationalReady = canOperate && Boolean(board.data) && Boolean(stations.data), applicationLoading = definitions.isLoading || profiles.isLoading
  const applicationError = definitions.error ?? profiles.error
  const boardTooOld = canOperate && Boolean(board.data) && now - Date.parse(board.data!.serverTime) > 30000
  const stale = stations.isError || (canOperate && (board.isError || boardTooOld || !operations.visible || !board.data))
  const configurationUnavailable = stations.isError || profiles.isLoading || profiles.isError
  const refresh = () => { void client.invalidateQueries({ queryKey: ['stations'] }); if (canOperate) void client.invalidateQueries({ queryKey: ['gaming-operations'] }) }
  const filter = (changes: Partial<typeof defaults>) => setUrl({ ...changes, search, page: '1' })
  const clearFilters = () => { setSearch(''); setUrl({ search: '', status: '', locationId: '', areaId: '', profileId: '', connection: '', page: '1' }) }
  const hasFilters = Boolean(state.search || state.status || state.locationId || state.areaId || state.profileId || state.connection)
  const resourceQuery = new URLSearchParams()
  if (state.locationId) resourceQuery.set('locationId', state.locationId)
  if (state.areaId) resourceQuery.set('areaId', state.areaId)
  const resourceUrl = `/resources${resourceQuery.size ? `?${resourceQuery}` : ''}`
  const handlers: StationViewHandlers = {
    configurationDisabled: configurationUnavailable,
    administrationDisabled: stations.isError,
    details: (station, tab = 'OVERVIEW', trigger) => {
      detailOpener.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : titleRef.current)
      setDetailTab(tab); setUrl({ stationId: station.resourceId })
    },
    configure: station => { if (maintain && !configurationUnavailable) setStationEdit(station) },
    identity: station => { if (machineManage && !stations.isError) setMachineStation(station) },
    employees: station => { if (resourceManage && !stations.isError) setResourceEmployees(station) },
  }
  const closeDetails = () => {
    if (!detailOpener.current?.isConnected) window.requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }))
    setUrl({ stationId: '' })
  }
  function deleteItem(kind: 'application' | 'profile', value: ApplicationDefinition | ApplicationProfile) {
    if (!manage || deleting) return
    const label = kind === 'application' ? 'aplikaciju' : 'profil'
    confirm({ title: kind === 'application' ? 'Obriši aplikaciju' : 'Obriši profil aplikacija', description: `„${value.name}“ biće uklonjen${kind === 'application' ? 'a' : ''}. Stavke koje su u upotrebi nije moguće obrisati.`,
      variant: 'danger', confirmLabel: `Obriši ${label}`, formatError: cause => stationError(cause, `Nije moguće obrisati ${label}.`),
      onConfirm: async () => {
        if (deleteInFlight.current) throw new Error('Sačekajte završetak prethodne akcije.')
        deleteInFlight.current = true; setDeleting(true)
        try {
          if (kind === 'application') await stationApi.deleteDefinition(value.id, value.version)
          else await stationApi.deleteProfile(value.id, value.version)
          toast(kind === 'application' ? 'Aplikacija je obrisana.' : 'Profil je obrisan.', 'success')
        } finally {
          await Promise.all([client.invalidateQueries({ queryKey: ['stations'] }), client.invalidateQueries({ queryKey: ['gaming-operations'] })])
          deleteInFlight.current = false; setDeleting(false)
        }
      } })
  }
  if (!canRead) return <main className="workspace gm-stations"><EmptyState title="Gaming stanice nisu dostupne" description="Nemate dozvolu za pregled stanica." /></main>

  return <main className="workspace gm-stations">
    {confirmationDialog}
    <header className="gm-stations-heading"><div className="gm-stations-heading-title"><span className="gm-stations-heading-icon"><StationIcon /></span><div>
      <h1 ref={titleRef} tabIndex={-1}>Gaming stanice</h1><p>Pregled i upravljanje gaming stanicama, njihovim stanjem i konfiguracijom.</p></div></div>
      <div className="gm-stations-heading-actions"><Button type="button" variant="secondary" loading={stations.isFetching || canOperate && board.isFetching} onClick={refresh}><StationIcon kind="refresh" />Osveži</Button>
        {resourceManage && <Link className="button button-primary" to={resourceUrl} title="Otvara postojeće upravljanje resursima za kreiranje gaming računara">+ Nova stanica</Link>}</div></header>
    <div className="gm-stations-kpis" aria-label="Statistika gaming stanica">
      <div className="gm-stations-kpi gm-stations-kpi--total"><StationIcon /><span>Ukupno stanica</span><strong>{stations.data ? allStations.length : '—'}</strong><small>Sve gaming PC stanice u pregledu</small></div>
      <div className="gm-stations-kpi gm-stations-kpi--active"><StationIcon /><span>U upotrebi</span><strong>{operationalReady ? operationalStations.filter(value => value.live?.sessionId).length : '—'}</strong><small>Stvarna aktivna gaming sesija</small></div>
      <div className="gm-stations-kpi gm-stations-kpi--available"><StationIcon /><span>Slobodne stanice</span><strong>{operationalReady ? operationalStations.filter(value => permitsStationAction(user, value.live!, 'START')).length : '—'}</strong><small>Sistem dozvoljava pokretanje sesije</small></div>
      <div className="gm-stations-kpi gm-stations-kpi--problem"><StationIcon kind="shield" /><span>Problematične stanice</span><strong>{operationalReady ? operationalStations.filter(problematicStation).length : '—'}</strong><small>Održavanje, van upotrebe, veza ili potrebna intervencija</small></div>
    </div>
    <p className="gm-stations-stat-scope">Ukupan broj obuhvata sve stanice u pregledu. {operationalReady
      ? `Operativni pokazatelji obuhvataju ${operationalStations.length} stanica u vašem Gaming Operations opsegu, bez uticaja filtera i paginacije.`
      : 'Operativni pokazatelji zahtevaju dozvolu i dostupan pregled Gaming operative.'} Problematične uključuju i isteklu sesiju, nepotvrđeno zaključavanje, komandu bez potvrde i nedovršenu konfiguraciju.</p>
    <section className="gm-stations-section gm-stations-filters" aria-label="Pretraga i filteri stanica">
      <div className="gm-stations-filter-main"><label className="gm-stations-search"><span>Pretraga stanica</span><div><StationIcon kind="search" /><Input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Pretraži po nazivu, kodu ili klijentu..." /></div></label>
        <label>Status<Select value={state.status} onChange={event => filter({ status: event.target.value })}><option value="">Svi statusi</option>{Object.entries(stationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label>Lokal<Select value={state.locationId} onChange={event => filter({ locationId: event.target.value, areaId: '' })}><option value="">Svi lokali</option>{locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          {state.locationId && !locations.some(([id]) => id === state.locationId) && <option value={state.locationId}>Izabrani lokal nije dostupan</option>}</Select></label>
        <label>Zona<Select value={state.areaId} onChange={event => filter({ areaId: event.target.value })}><option value="">Sve zone</option>{areas.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
      </div>
      <div className="gm-stations-filter-actions"><Button type="button" variant="secondary" aria-expanded={moreFilters} aria-controls="station-extra-filters" onClick={() => setMoreFilters(value => !value)}><StationIcon kind="filter" />Više filtera{(state.profileId || state.connection) && <span aria-label="Aktivni dodatni filteri"> •</span>}</Button>
        {hasFilters && <Button type="button" variant="secondary" onClick={clearFilters}>Očisti filtere</Button>}</div>
      {moreFilters && <div className="gm-stations-filter-extra" id="station-extra-filters"><label>Profil aplikacija<Select value={state.profileId} onChange={event => filter({ profileId: event.target.value })}><option value="">Svi profili</option><option value="none">Bez profila</option>
        {(profiles.data ?? []).map(value => <option key={value.id} value={value.id}>{value.name}{!value.active && ' · neaktivan'}</option>)}
        {state.profileId && state.profileId !== 'none' && !profiles.data?.some(value => value.id === state.profileId) && <option value={state.profileId}>Izabrani profil nije dostupan</option>}</Select></label>
        <label>Gaming Client konekcija<Select value={state.connection} onChange={event => filter({ connection: event.target.value })}><option value="">Sva stanja veze</option>{Object.entries(connections).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label></div>}
    </section>
    <section className="gm-stations-results" aria-labelledby="station-results-title">
      <header className="gm-stations-results-heading"><div><h2 id="station-results-title">Pregled stanica <span>{filtered.length}</span></h2>
        <div className="gm-stations-live-status">{canOperate ? <><Badge tone={stale ? 'warning' : operations.connection === 'connected' ? 'success' : 'warning'}>{!operations.visible ? 'Osvežavanje pauzirano' : board.isError || boardTooOld ? 'Podaci mogu biti zastareli' : operations.connection === 'connected' ? 'Povezano' : operations.connection === 'reconnecting' ? 'Ponovno povezivanje' : 'Povezivanje'}</Badge>
          {board.data && <small>Podaci od {formatBusinessDateTime(board.data.serverTime, false, 'sr-Latn-RS')}</small>}</> : <small>Pregled konfiguracije · automatsko osvežavanje</small>}</div></div>
        <div className="gm-stations-view-switch" role="group" aria-label="Način prikaza stanica"><button type="button" aria-pressed={state.view !== 'table'} onClick={() => setUrl({ view: 'cards' })}><StationIcon kind="grid" />Kartice</button>
          <button type="button" aria-pressed={state.view === 'table'} onClick={() => setUrl({ view: 'table' })}><StationIcon kind="table" />Tabela</button></div></header>
      {canOperate && (board.isError || boardTooOld || operations.connection === 'reconnecting') && <div className="gm-stations-warning" role="status">{board.isError ? stationError(board.error, 'Operativno stanje trenutno nije dostupno.') : 'Ponovno povezivanje ili kašnjenje operativnih podataka.'} Podaci mogu biti zastareli. Automatsko osvežavanje će pokušati ponovo.</div>}
      {stations.isError && stations.data && <div className="gm-stations-warning" role="alert">{stationError(stations.error, 'Osvežavanje stanica nije uspelo.')} Prikazani podaci mogu biti zastareli.<Button type="button" variant="secondary" onClick={refresh}>Pokušaj ponovo</Button></div>}
      {stations.isLoading ? <div className="gm-stations-grid">{[0, 1, 2].map(index => <div className="gm-stations-card" key={index}><Skeleton lines={7} label="Učitavanje stanice" /></div>)}</div>
        : stations.isError && !stations.data ? <ErrorState message={stationError(stations.error, 'Stanice nisu dostupne.')} action={<Button type="button" onClick={refresh}>Pokušaj ponovo</Button>} />
          : !allStations.length ? <EmptyState title="Nema gaming stanica" description="Gaming računar dodaje se kroz postojeće upravljanje fizičkim resursima." action={resourceManage ? <Link className="button button-primary" to={resourceUrl}>+ Nova stanica</Link> : undefined} />
            : !filtered.length ? <EmptyState title="Nema stanica za izabrane filtere" description="Promenite pretragu ili filtere da biste proširili pregled." action={<Button type="button" variant="secondary" onClick={clearFilters}>Očisti filtere</Button>} />
              : state.view === 'table' ? <StationsTable stations={current} user={user} now={now} selectedId={state.stationId} disabled={stale} handlers={handlers} />
                : <div className="gm-stations-grid">{current.map(value => <StationCard key={value.resourceId} station={value} user={user} now={now} selected={state.stationId === value.resourceId} disabled={stale} handlers={handlers} />)}</div>}
      {Boolean(allStations.length) && <div className="gm-stations-pagination"><div><span>Stranica {page + 1} od {Math.max(1, Math.ceil(filtered.length / pageSize))}</span><label>Po stranici<Select value={String(pageSize)} onChange={event => setUrl({ size: event.target.value, page: '1' })}>{pageSizes.map(size => <option key={size} value={size}>{size}</option>)}</Select></label></div>
        <GamingBoardPagination page={page} pageSize={pageSize} total={filtered.length} label="Stranice gaming stanica" onChange={next => setUrl({ page: String(next + 1) })} /></div>}
    </section>
    <StationClientPackage data={clientPackage.data} loading={clientPackage.isLoading} error={clientPackage.error} onRefresh={refresh} />
    <StationAdministration definitions={definitions.data ?? []} profiles={profiles.data ?? []} loadingDefinitions={definitions.isLoading} loadingProfiles={profiles.isLoading}
      definitionsError={definitions.error} profilesError={profiles.error} manage={manage} busy={deleting || definitions.isFetching || profiles.isFetching}
      onDefinition={value => { if (manage) setDefinitionEdit(value) }} onProfile={value => { if (manage && !applicationLoading && !applicationError) setProfileEdit(value) }}
      deleteDefinition={value => deleteItem('application', value)} deleteProfile={value => deleteItem('profile', value)} onRefresh={refresh} />
    {selected && <StationDetails station={selected} user={user} now={now} initialTab={detailTab} profiles={profiles.data ?? []} definitions={definitions.data ?? []}
      applicationLoading={applicationLoading} applicationError={applicationError} stale={stale} returnFocusRef={detailOpener} handlers={handlers} onClose={closeDetails} onRefresh={refresh} />}
    {state.stationId && !selected && stations.data && !stations.isError && <div className="gm-stations-warning" role="status">Izabrana stanica više nije dostupna u ovom pregledu.<Button type="button" variant="secondary" onClick={closeDetails}>Zatvori selekciju</Button></div>}
    {stationEdit && maintain && <StationConfigurationDialog key={stationEdit.resourceId} station={stationEdit} profiles={profiles.data ?? []} onClose={() => setStationEdit(null)} />}
    {definitionEdit !== undefined && manage && <ApplicationDialog value={definitionEdit} onClose={() => setDefinitionEdit(undefined)} />}
    {profileEdit !== undefined && manage && <ApplicationProfileDialog value={profileEdit} definitions={definitions.data ?? []} onClose={() => setProfileEdit(undefined)} />}
    {machineStation && machineManage && <StationIdentityDialog key={machineStation.resourceId} station={machineStation} onClose={() => setMachineStation(null)} />}
    {resourceEmployees && resourceManage && <ResourceEmployees resourceId={resourceEmployees.resourceId} resourceName={resourceEmployees.resourceName} onClose={() => setResourceEmployees(null)} />}
  </main>
}

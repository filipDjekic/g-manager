import { useGamingCommands } from './useGamingCommands'
import { gamingBoardStale } from './freshness'
import { useResettableState } from '../components/useResettableState'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmployeeWorkdaySummary } from '../dashboard/EmployeeWorkdaySummary'
import { Link } from 'react-router-dom'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { apiErrorMessage } from '../api/client'
import { Badge, Button, EmptyState, ErrorState, Input, Modal, Select, Skeleton, PageHeader, PageLayout, Card, Drawer, MetricStrip, SegmentedControl, FreshnessStatus, useContentWidth } from '../components/ui'
import { ActionDialog } from '../components/ui/ActionDialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { useListUrlState } from '../lists/useListUrlState'
import { StartSessionDialog } from '../gaming/StartSessionDialog'
import { useGamingOperations } from '../gaming/useGamingOperations'
import { useServerNow } from '../gaming/useServerNow'
import { enforcementLabels, needsAttention, stationLabels } from '../gaming/presentation'
import { GamingBoardPagination } from '../gaming/GamingBoardPagination'
import { readGamingPage } from '../gaming/GamingBoardPagination.model'
import { GamingOperationsIcon, GamingSessionsTable, StationDetailsPanel, StationTile } from '../gaming/GamingStationViews'
import { isExpiringStation, stationSeconds } from '../gaming/operationsPresentation'
import '../gaming/gamingOperations.css'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { GamingStationCard } from '../types/gamingSession.types'

const defaults = { search: '', locationId: '', status: '', attention: '', expiring: '', ready: '', sessions: '', offline: '', sort: 'attention', stationId: '', stationPage: '1', sessionPage: '1', stationSize: '10', sessionSize: '10', view: 'cards' }
const allowed = Object.keys(defaults) as (keyof typeof defaults)[]

export function GamingOperationsWorkspace({ workday = false }: { workday?: boolean }) {
  const actor = useAuthStore((state) => state.user)
  const canRead = hasCapability(actor, 'GAMING_SESSION_READ')
  const canStart = hasCapability(actor, 'GAMING_SESSION_START')
  const { board, connection, visible } = useGamingOperations(canRead)
  const url = useListUrlState(defaults, allowed), now = useServerNow(board.data?.serverTime)
  const setUrl = url.set
  const stationPageSize = [10, 20, 50, 100].includes(Number(url.state.stationSize)) ? Number(url.state.stationSize) : 10
  const sessionPageSize = [10, 20, 50, 100].includes(Number(url.state.sessionSize)) ? Number(url.state.sessionSize) : 10
  const { ref: root, wide } = useContentWidth()
  const [moreFilters, setMoreFilters] = useState(false)
  const [requestedResourceId, setSelectedResourceId] = useResettableState(() => url.state.stationId, url.state.stationId)
  const {
    startStation, setStartStation, newSessionOpen, setNewSessionOpen, customStation,
    setCustomStation, minutes, setMinutes, endStation, setEndStation,
    historyStation, setHistoryStation, recoveryAction, setRecoveryAction, error,
    setError, busy, hasPending, extend, terminateRequest,
    feedback, recover, openStart, openCustom, openEnd,
    openRecovery
  } = useGamingCommands()
  const history = useQuery({ queryKey: ['gaming-operations', 'history', historyStation?.resourceId],
    queryFn: () => gamingSessionApi.history(historyStation!.resourceId), enabled: canRead && !!historyStation })
  const stations = useMemo(() => board.data?.stations ?? [], [board.data])
  const liveHistoryStation=stations.find(value=>value.resourceId===historyStation?.resourceId)??historyStation
  const locations = useMemo(() => [...new Map((board.data?.stations ?? []).map((value) => [value.locationId, value.locationName ?? 'Lokacija'])).entries()], [board.data])
  const filtered = useMemo(() => stations.filter((station) => {
    const search = url.state.search.trim().toLocaleLowerCase('sr')
    return (!search || `${station.resourceName} ${station.resourceCode} ${station.customerDisplayName ?? ''} ${station.applicationProfileName ?? ''}`.toLocaleLowerCase('sr').includes(search))
      && (!url.state.locationId || station.locationId === url.state.locationId)
      && (!url.state.status || station.status === url.state.status)
      && (!url.state.stationId || station.resourceId === url.state.stationId)
      && (url.state.ready !== 'true' || station.allowedActions.includes('START'))
      && (url.state.sessions !== 'true' || !!station.sessionId)
      && (url.state.offline !== 'true' || station.staleHeartbeat || station.status === 'OFFLINE')
      && (url.state.attention !== 'true' || needsAttention(station))
      && (url.state.expiring !== 'true' || isExpiringStation(station, now))
  }).sort((a, b) => (url.state.sort === 'attention' ? Number(needsAttention(b)) - Number(needsAttention(a)) : url.state.sort === 'expiry' ?
    (a.endsAt ? Date.parse(a.endsAt) : Infinity) - (b.endsAt ? Date.parse(b.endsAt) : Infinity) : 0) || a.resourceName.localeCompare(b.resourceName, 'sr', { numeric: true })), [stations, url.state, now])
  const sessions = useMemo(() => filtered.filter((station) => !!station.sessionId), [filtered])
  const stationPage = Math.min(readGamingPage(url.state.stationPage), Math.max(0, Math.ceil(filtered.length / stationPageSize) - 1))
  const sessionPage = Math.min(readGamingPage(url.state.sessionPage), Math.max(0, Math.ceil(sessions.length / sessionPageSize) - 1))
  const pageStations = filtered.slice(stationPage * stationPageSize, (stationPage + 1) * stationPageSize)
  const pageSessions = sessions.slice(sessionPage * sessionPageSize, (sessionPage + 1) * sessionPageSize)
  const selectedResourceId = requestedResourceId
  const selectedStation = stations.find((station) => station.resourceId === selectedResourceId)
  const selectStation = useCallback((station: GamingStationCard) => setSelectedResourceId(station.resourceId), [setSelectedResourceId])
  const handlers = useMemo(() => ({ onStart: openStart, onExtend: extend, onEnd: openEnd, onCustom: openCustom,
    onHistory: setHistoryStation, onRecovery: openRecovery }), [openStart, extend, openEnd, openCustom, openRecovery, setHistoryStation])

  useEffect(() => {
    if (!board.data || board.error) return
    const changes: Partial<typeof defaults> = {}
    if (url.state.stationPage !== String(stationPage + 1)) changes.stationPage = String(stationPage + 1)
    if (url.state.sessionPage !== String(sessionPage + 1)) changes.sessionPage = String(sessionPage + 1)
    if (Object.keys(changes).length) setUrl(changes, true)
  }, [board.data, board.error, stationPage, sessionPage, url.state.stationPage, url.state.sessionPage, setUrl])

  function setFilters(changes: Partial<typeof defaults>, replace = false) {
    setUrl({ ...changes, stationPage: '1', sessionPage: '1' }, replace)
  }
  function primaryFilter(filter: string) {
    setFilters({ attention: '', expiring: '', offline: '', status: filter === 'MAINTENANCE' || filter === 'RETIRED' ? filter : '',
      ready: filter === 'ready' ? 'true' : '', sessions: filter === 'sessions' ? 'true' : '', stationId: '' })
  }
  function alertFilter(filter: 'offline' | 'attention' | 'expiring') {
    setFilters({ search: '', locationId: '', status: '', ready: '', sessions: '', stationId: '', offline: filter === 'offline' ? 'true' : '',
      attention: filter === 'attention' ? 'true' : '', expiring: filter === 'expiring' ? 'true' : '' })
  }
  const readyCount = stations.filter((station) => station.allowedActions.includes('START')).length
  const activeCount = stations.filter((station) => !!station.sessionId).length
  const attentionCount = stations.filter(needsAttention).length
  const offlineCount = stations.filter((station) => station.staleHeartbeat || station.status === 'OFFLINE').length
  const expiringCount = stations.filter((station) => isExpiringStation(station, now)).length
  const primary = url.state.status || (url.state.ready === 'true' ? 'ready' : url.state.sessions === 'true' ? 'sessions' : 'all')
  const stale = gamingBoardStale(board.data?.serverTime, now)
  const disabled = busy || hasPending || !!board.error || stale || !visible

  if (!canRead) return <PageLayout className="gaming-ops-page"><ErrorState title="Gaming sesije nisu dostupne" message="Nemate dozvolu za ovaj pregled." /></PageLayout>

  return <PageLayout ref={root} className="gaming-operations gaming-ops-page" aria-busy={board.isLoading || busy || undefined}>
    <PageHeader title={workday ? 'Radni ekran' : 'Stanje računara sada'} description="Sesije na dodeljenim PC stanicama. Dostupnost celog trajanja proverava se pri pokretanju."
      icon={<GamingOperationsIcon kind="gamepad" />} actions={<><Button variant="secondary" loading={board.isFetching} onClick={() => void board.refetch()}>Osveži</Button>
      {canStart && <Button disabled={disabled || !board.data || !readyCount} onClick={() => { setError(''); setStartStation(null); setNewSessionOpen(true) }}>+ Nova sesija</Button>}</>} />
    {hasCapability(actor,'RESOURCE_READ')&&<p className="ui-workspace-scope">{actor?.role==='EMPLOYEE'?'Moje dodeljene PC stanice':'PC stanice u dozvoljenom opsegu'} · <Link to="/resources">Mapa dostupnosti za interval →</Link></p>}
    <FreshnessStatus time={board.data?.serverTime} error={!!board.error} stale={stale} connected={connection === 'connected'} paused={!visible} />
    {!customStation&&!endStation&&!recoveryAction&&feedback}
    {board.error && board.data && <ErrorState title="Prikaz može biti zastareo" message="Proverite vezu i osvežite pre sledeće akcije." action={<Button variant="secondary" onClick={() => board.refetch()}>Pokušaj ponovo</Button>} />}
    {board.data && <MetricStrip label="Dodeljeni PC računari">
      <Button variant="ghost" onClick={() => url.apply({})}>Ukupno <strong>{stations.length}</strong></Button>
      <Button variant="ghost" onClick={() => primaryFilter('ready')}>Spremni za pokretanje <strong>{readyCount}</strong></Button>
      <Button variant="ghost" onClick={() => primaryFilter('sessions')}>Aktivni <strong>{activeCount}</strong></Button>
      <Button variant="ghost" onClick={() => alertFilter('expiring')}>Ističu ≤10 min <strong>{expiringCount}</strong></Button>
      <Button variant="ghost" onClick={() => alertFilter('attention')}>Za proveru <strong>{attentionCount}</strong></Button>
      {offlineCount > 0 && <Button variant="warning" onClick={() => alertFilter('offline')}>Bez potvrđene veze {offlineCount}</Button>}
    </MetricStrip>}
    <section className="ui-filter-bar ops-filters" aria-label="Filteri računara i sesija">
      <div className="ui-list-toolbar-main"><label className="ops-search">Pretraga<Input type="search" value={url.state.search}
        placeholder="Računar ili klijent" onChange={event => setFilters({ search: event.target.value }, true)} /></label>
        <label>Lokacija<Select value={url.state.locationId} onChange={event => setFilters({ locationId: event.target.value })}>
          <option value="">Sve dodeljene lokacije</option>{locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label></div>
      <SegmentedControl label="Prikaz računara" value={url.state.attention === 'true' ? 'attention' : primary}
        options={[{ value: 'all', label: 'Svi' }, { value: 'ready', label: 'Spremni' }, { value: 'sessions', label: 'Aktivni' }, { value: 'attention', label: 'Za proveru' }]}
        onChange={value => { if (value === 'attention') alertFilter('attention'); else primaryFilter(value) }} />
      <div className="ui-actions"><SegmentedControl label="Način prikaza" value={url.state.view === 'table' ? 'table' : 'cards'}
        options={[{ value: 'cards', label: 'Kartice' }, { value: 'table', label: 'Lista' }]} onChange={view => setUrl({ view })} />
        <Button variant="secondary" aria-expanded={moreFilters} onClick={() => setMoreFilters(value => !value)}>Više filtera</Button>
        <Button variant="ghost" onClick={() => url.apply({})}>Poništi filtere</Button></div>
      {moreFilters && <div className="ops-filter-fields"><label>Status<Select value={url.state.status} onChange={event => setFilters({ status: event.target.value, ready: '', sessions: '' })}>
        <option value="">Sva stanja</option>{Object.entries(stationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label>Sortiranje<Select value={url.state.sort} onChange={event => setFilters({ sort: event.target.value })}>
          <option value="attention">Prvo za proveru</option><option value="name">Naziv računara</option><option value="expiry">Najbliži kraj sesije</option></Select></label>
        {(['attention', 'expiring', 'offline'] as const).map((key, index) => <label className="inline-toggle" key={key}><Input type="checkbox"
          checked={url.state[key] === 'true'} onChange={event => setFilters({ [key]: event.target.checked ? 'true' : '' })} />{['Za proveru', 'Ističu ≤10 min', 'Bez veze'][index]}</label>)}
      </div>}
      {url.state.stationId && <div className="ops-focused-filter">Filter izabrane stanice je aktivan.
        <Button type="button" variant="secondary" onClick={() => setFilters({ stationId: '' })}>Prikaži ostale računare</Button></div>}
    </section>
    <div className={`ops-workspace${wide && selectedStation ? ' has-selection' : ''}`}>
      <section className="ops-stations" aria-labelledby="ops-stations-title">
        <div className="ops-section-heading"><h2 id="ops-stations-title">Računari</h2>{board.data && <span>{filtered.length} od {stations.length} stanica · {stationPageSize} po stranici</span>}</div>
        {board.isLoading ? <div className="ops-station-grid">{Array.from({ length: 8 }, (_, index) => <Card as="div" className="ui-card" key={index}><Skeleton lines={6} label="Učitavanje računara" /></Card>)}</div> :
          !board.data && board.error ? <ErrorState message={apiErrorMessage(board.error, 'Gaming tabla nije dostupna.')} action={<Button variant="secondary" onClick={() => void board.refetch()}>Pokušaj ponovo</Button>} /> :
          !stations.length ? <EmptyState title="Nema dostupnih stanica" description={actor?.role==='EMPLOYEE'?'Nemate dostupne dodeljene PC stanice. Zatražite od administratora dodelu konkretnih resursa.':'Dodajte Gaming PC i proverite njegovu konfiguraciju.'}
            action={hasCapability(actor, 'STATION_READ') && <Link to="/stations">Podešavanje stanica</Link>} /> :
          !filtered.length ? <EmptyState title="Nema stanica za izabrane filtere" action={<Button onClick={() => url.apply({})}>Prikaži sve stanice</Button>} /> :
          url.state.view === 'table' ? <GamingSessionsTable stations={pageStations} selectedId={selectedResourceId} now={now}
            disabled={disabled} handlers={handlers} onSelect={selectStation} /> : <div className="ops-station-grid">{pageStations.map((station) => <StationTile key={station.resourceId} station={station}
            seconds={stationSeconds(station, now)} selected={station.resourceId === selectedResourceId} disabled={disabled} handlers={handlers} onSelect={selectStation} />)}</div>}
        {board.data && <GamingBoardPagination page={stationPage} pageSize={stationPageSize} total={filtered.length} label="Stranice računara"
          loading={board.isFetching} onSizeChange={size => setUrl({ stationSize: String(size), stationPage: '1' })}
          onChange={(page) => setUrl({ stationPage: String(page + 1) })} />}
      </section>
      {wide && selectedStation && <div><Button variant="ghost" onClick={() => setSelectedResourceId('')}>Zatvori detalje</Button>
        <StationDetailsPanel station={selectedStation} now={now} disabled={disabled} handlers={handlers}
          outsidePage={!pageStations.some(station => station.resourceId === selectedResourceId)} /></div>}
    </div>
    <Drawer open={!wide && !!selectedStation} title="Detalji računara" onClose={() => setSelectedResourceId('')} size="wide">
      <div className="gaming-ops-page">{!wide && selectedStation && <StationDetailsPanel station={selectedStation} now={now} disabled={disabled} handlers={handlers} />}</div>
    </Drawer>
    <details className="ui-advanced-filters"><summary>Samo aktivne sesije ({sessions.length})</summary>
      <GamingSessionsTable stations={pageSessions} selectedId={selectedResourceId} now={now} disabled={disabled} handlers={handlers} onSelect={selectStation} />
      <GamingBoardPagination page={sessionPage} pageSize={sessionPageSize} total={sessions.length} label="Stranice aktivnih sesija"
        onSizeChange={size => setUrl({ sessionSize: String(size), sessionPage: '1' })} onChange={page => setUrl({ sessionPage: String(page + 1) })} />
    </details>
    {workday && <EmployeeWorkdaySummary />}
    {newSessionOpen && <StartSessionDialog station={startStation ?? undefined} onClose={() => { setNewSessionOpen(false); setStartStation(null) }} />}
    <Modal open={!!customStation} title="Prilagođeno produženje" closeDisabled={busy || hasPending} onClose={() => { if (!busy && !hasPending) setCustomStation(null) }}><form className="ui-form-grid form-grid" onSubmit={(event) => { event.preventDefault(); if (customStation&&!hasPending) void extend(customStation, minutes) }}>
      {feedback}<label>Broj minuta<Input aria-label={"Broj minuta"} required type="number" min={1} max={120} disabled={busy||hasPending} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label><Button type="submit" loading={busy} disabled={hasPending}>Produži sesiju</Button></form></Modal>
    <ConfirmDialog open={!!endStation} title={`Završi sesiju · ${endStation?.resourceName ?? ''}`} variant="danger"
      description={<><p>Sesija će biti završena i stanica će dobiti komandu za zaključavanje.</p>{feedback}</>}
      reasonLabel="Razlog završetka" reasonRequired loading={busy} disabled={hasPending} autoClose={false}
      confirmLabel="Potvrdi završetak" onClose={() => { if (!busy && !hasPending) setEndStation(null) }}
      onConfirm={async (reason) => { if (endStation && !hasPending && reason) await terminateRequest(endStation, reason) }} />
    <ActionDialog open={!!recoveryAction} title={recoveryAction?.confirm ? 'Potvrda fizičkog zaključavanja' : 'Ponovo pošalji force-lock'}
      description={`${recoveryAction?.station.resourceName ?? ''}: ${recoveryAction?.confirm ? 'Potvrdite tek nakon fizičke provere da je računar zaključan. Potvrda će biti evidentirana.' : 'Klijent će ponovo dobiti komandu za zaključavanje. Pratite potvrdu komande na kartici.'}${error ? ` ${error}` : ''}`}
      confirmLabel={recoveryAction?.confirm ? 'Provereno je zaključano' : 'Pošalji komandu'} danger loading={busy} error={error}
      onClose={() => { if (!busy) setRecoveryAction(null) }} onConfirm={recover} />
    <Modal open={!!historyStation} title={`Istorija stanice · ${liveHistoryStation?.resourceName ?? ''}`} onClose={() => setHistoryStation(null)}>
      {liveHistoryStation && <dl className="station-detail"><div><dt>Operativno / efektivno stanje</dt><dd>{liveHistoryStation.operationalStatus ?? liveHistoryStation.status} / {liveHistoryStation.effectiveStatus ?? liveHistoryStation.status}</dd></div>
        <div><dt>Profil / verzija</dt><dd>{liveHistoryStation.applicationProfileName ?? 'Nije podešen'} · {liveHistoryStation.configurationVersion ?? '-'}</dd></div>
        <div><dt>Client / heartbeat</dt><dd>{liveHistoryStation.clientVersion ?? 'Nije prijavljen'} · {liveHistoryStation.lastHeartbeatAt ? formatBusinessDateTime(liveHistoryStation.lastHeartbeatAt) : 'Nema heartbeat-a'}</dd></div>
        <div><dt>Lokalno zaključavanje</dt><dd>{enforcementLabels[liveHistoryStation.enforcementStatus]}{liveHistoryStation.lastLockAckAt && ` · ${formatBusinessDateTime(liveHistoryStation.lastLockAckAt)}`}</dd></div>
        <div><dt>Poslednja komanda</dt><dd>{liveHistoryStation.commandType ?? 'Nema komandi'} {liveHistoryStation.commandSequence && `#${liveHistoryStation.commandSequence}`} · {liveHistoryStation.commandAcknowledgedAt ? 'Potvrđena' : liveHistoryStation.commandSequence ? 'Čeka potvrdu' : '-'}</dd></div></dl>}
      {history.isLoading ? <Skeleton lines={5} label="Učitavanje istorije" /> : history.error ? <ErrorState message={apiErrorMessage(history.error, 'Istorija stanice nije dostupna.')} action={<Button variant="secondary" onClick={() => history.refetch()}>Pokušaj ponovo</Button>} /> : !history.data?.entries.length ?
        <EmptyState title="Nema istorije" description="Za ovu stanicu još nema komandi ili enforcement događaja." /> : <ol className="timeline-list">{history.data.entries.map((entry, index) => <li key={`${entry.occurredAt}-${entry.commandSequence ?? index}`}>
          <time dateTime={entry.occurredAt}>{formatBusinessDateTime(entry.occurredAt)}</time><strong>{entry.action}</strong><Badge tone={entry.status === 'PENDING' ? 'warning' : 'neutral'}>{entry.status}</Badge>
          {entry.commandSequence !== undefined && <small>Komanda #{entry.commandSequence}</small>}{entry.correlationId && <code>Support ID: {entry.correlationId}</code>}{entry.details && <p>{entry.details}</p>}</li>)}</ol>}
    </Modal>
  </PageLayout>
}

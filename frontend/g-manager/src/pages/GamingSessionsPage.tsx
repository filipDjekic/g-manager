import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { apiErrorMessage } from '../api/client'
import { IdempotencyKeyManager } from '../api/idempotency'
import { Badge, Button, EmptyState, ErrorState, Input, Modal, Select, Skeleton } from '../components/ui'
import { ActionDialog } from '../components/ui/ActionDialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { useListUrlState } from '../lists/useListUrlState'
import { StartSessionDialog } from '../gaming/StartSessionDialog'
import { useGamingOperations } from '../gaming/useGamingOperations'
import { useServerNow } from '../gaming/useServerNow'
import { enforcementLabels, needsAttention, stationLabels } from '../gaming/presentation'
import { GamingBoardPagination, readGamingPage } from '../gaming/GamingBoardPagination'
import { GamingOperationsIcon, GamingSessionsTable, StationDetailsPanel, StationTile } from '../gaming/GamingStationViews'
import { isExpiringStation, stationSeconds } from '../gaming/operationsPresentation'
import '../gaming/gamingOperations.css'
import { formatBusinessDateTime, formatBusinessTime } from '../reservations/dateTime'
import type { GamingStationCard } from '../types/gamingSession.types'

const defaults = { search: '', locationId: '', status: '', attention: '', expiring: '', ready: '', sessions: '', offline: '', sort: 'attention', stationId: '', stationPage: '1', sessionPage: '1' }
const allowed = Object.keys(defaults) as (keyof typeof defaults)[]
const stationPageSize = 8
const sessionPageSize = 10

export function GamingSessionsPage() {
  const actor = useAuthStore((state) => state.user)
  const canRead = hasCapability(actor, 'GAMING_SESSION_READ')
  const canStart = hasCapability(actor, 'GAMING_SESSION_START')
  const client = useQueryClient(), { board, connection, visible } = useGamingOperations(canRead)
  const url = useListUrlState(defaults, allowed), now = useServerNow(board.data?.serverTime)
  const [startStation, setStartStation] = useState<GamingStationCard | null>(null)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [selectedResourceId, setSelectedResourceId] = useState(url.state.stationId)
  const [customStation, setCustomStation] = useState<GamingStationCard | null>(null), [minutes, setMinutes] = useState(30)
  const [endStation, setEndStation] = useState<GamingStationCard | null>(null)
  const [historyStation, setHistoryStation] = useState<GamingStationCard | null>(null)
  const [recoveryAction, setRecoveryAction] = useState<{ station: GamingStationCard; confirm: boolean } | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [hasPending,setHasPending]=useState(false)
  const pending=useRef<{kind:'EXTEND';station:GamingStationCard;minutes:number}|{kind:'TERMINATE';station:GamingStationCard;reason:string}|null>(null)
  const inFlight = useRef(false), keys = useRef(new Map<string, IdempotencyKeyManager>())
  const history = useQuery({ queryKey: ['gaming-operations', 'history', historyStation?.resourceId],
    queryFn: () => gamingSessionApi.history(historyStation!.resourceId), enabled: canRead && !!historyStation })
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: ['gaming-operations'] }), [client])
  const extend = useCallback(async (station: GamingStationCard, duration: number) => {
    if (!station.sessionId || station.sessionVersion === undefined || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    const signature = `extend:${station.sessionId}:${station.sessionVersion}:${duration}`
    const key = keys.current.get(signature) ?? new IdempotencyKeyManager(); keys.current.set(signature, key)
    try { await gamingSessionApi.extend(station.sessionId, duration, station.sessionVersion, key.begin()); keys.current.delete(signature);pending.current=null;setHasPending(false);setCustomStation(null) }
    catch (cause) { key.failed(cause);pending.current=key.pendingKey()?{kind:'EXTEND',station,minutes:duration}:null;setHasPending(!!pending.current);setError(apiErrorMessage(cause, 'Sesiju nije moguće produžiti.')) }
    finally { await refresh(); inFlight.current = false; setBusy(false) }
  }, [refresh])
  async function terminateRequest(station:GamingStationCard,endReason:string) {
    if (!station.sessionId || station.sessionVersion === undefined || !endReason || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    const signature = `end:${station.sessionId}:${station.sessionVersion}:${endReason}`
    const key = keys.current.get(signature) ?? new IdempotencyKeyManager(); keys.current.set(signature, key)
    try { await gamingSessionApi.terminate(station.sessionId,endReason,station.sessionVersion,key.begin());keys.current.delete(signature);pending.current=null;setHasPending(false);setEndStation(null) }
    catch (cause) { key.failed(cause);pending.current=key.pendingKey()?{kind:'TERMINATE',station,reason:endReason}:null;setHasPending(!!pending.current);setError(apiErrorMessage(cause, 'Sesiju nije moguće završiti.')) }
    finally { await refresh(); inFlight.current = false; setBusy(false) }
  }
  function retryPending() {
    const request=pending.current
    if(request?.kind==='EXTEND')void extend(request.station,request.minutes)
    else if(request)void terminateRequest(request.station,request.reason)
  }
  const feedback=error&&<div className="error-banner" role="alert">{error}{hasPending&&<><p>Ishod komande nije potvrđen. Ponovite isti zahtev pre sledeće akcije.</p><Button type="button" variant="secondary" disabled={busy} onClick={retryPending}>Proveri prethodnu komandu</Button></>}</div>
  async function recover() {
    if (!recoveryAction || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      if (recoveryAction.confirm) await gamingSessionApi.confirmLocked(recoveryAction.station.resourceId)
      else await gamingSessionApi.forceLock(recoveryAction.station.resourceId)
      setRecoveryAction(null)
    } catch (cause) { setError(apiErrorMessage(cause, 'Recovery akcija nije uspela.')) }
    finally { await refresh(); inFlight.current = false; setBusy(false) }
  }
  const openStart = useCallback((station: GamingStationCard) => { setError(''); setStartStation(station); setNewSessionOpen(true) }, [])
  const openCustom = useCallback((station: GamingStationCard) => { setError(''); setMinutes(30); setCustomStation(station) }, [])
  const openEnd = useCallback((station: GamingStationCard) => { setError(''); setEndStation(station) }, [])
  const openRecovery = useCallback((station: GamingStationCard, confirm: boolean) => { setError(''); setRecoveryAction({ station, confirm }) }, [])
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
  const selectedStation = stations.find((station) => station.resourceId === selectedResourceId)
  const selectStation = useCallback((station: GamingStationCard) => setSelectedResourceId(station.resourceId), [])
  const handlers = useMemo(() => ({ onStart: openStart, onExtend: extend, onEnd: openEnd, onCustom: openCustom,
    onHistory: setHistoryStation, onRecovery: openRecovery }), [openStart, extend, openEnd, openCustom, openRecovery])

  useEffect(() => {
    if (url.state.stationId) setSelectedResourceId(url.state.stationId)
  }, [url.state.stationId])
  useEffect(() => {
    if (!selectedResourceId && filtered.length) setSelectedResourceId((filtered.find((station) => station.sessionId) ?? filtered[0]).resourceId)
  }, [selectedResourceId, filtered])
  useEffect(() => {
    if (!board.data || board.error) return
    const changes: Partial<typeof defaults> = {}
    if (url.state.stationPage !== String(stationPage + 1)) changes.stationPage = String(stationPage + 1)
    if (url.state.sessionPage !== String(sessionPage + 1)) changes.sessionPage = String(sessionPage + 1)
    if (Object.keys(changes).length) url.set(changes, true)
  }, [board.data, board.error, stationPage, sessionPage, url.state.stationPage, url.state.sessionPage, url.set])

  function setFilters(changes: Partial<typeof defaults>, replace = false) {
    url.set({ ...changes, stationPage: '1', sessionPage: '1' }, replace)
  }
  function primaryFilter(filter: string) {
    setFilters({ status: filter === 'MAINTENANCE' || filter === 'RETIRED' ? filter : '',
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
  const disabled = busy || hasPending || !!board.error

  if (!canRead) return <main className="workspace gaming-ops-page"><ErrorState title="Gaming sesije nisu dostupne" message="Nemate dozvolu za ovaj pregled." /></main>

  return <main className="workspace gaming-operations gaming-ops-page" aria-busy={board.isLoading || busy || undefined}>
    <header className="ops-page-header">
      <div className="ops-title"><span className="ops-title-icon"><GamingOperationsIcon kind="gamepad" /></span>
        <div><p className="eyebrow">Gaming Control Center</p><h1>Gaming sesije</h1>
          <p>Pregled i upravljanje aktivnim sesijama na računarima.</p></div></div>
      <div className="ops-header-actions">
        <Button type="button" variant="secondary" loading={board.isFetching} onClick={() => void board.refetch()}>Osveži</Button>
        {canStart && <Button type="button" className="ops-new-session" disabled={disabled || !board.data || !readyCount}
          title={!readyCount ? 'Nema stanica koje dozvoljavaju novu sesiju' : undefined}
          onClick={() => { setError(''); setStartStation(null); setNewSessionOpen(true) }}><span aria-hidden="true">+</span>Nova sesija</Button>}
      </div>
    </header>
    <div className="ops-live-status"><Badge tone={board.error ? 'danger' : connection === 'connected' && visible ? 'success' : 'warning'}>
      {board.error ? 'Osvežavanje nije uspelo' : !visible ? 'Osvežavanje pauzirano' : connection === 'connected' ? 'Veza uživo' : 'Periodično osvežavanje · 15 s'}</Badge>
      {board.data && <time dateTime={board.data.serverTime}>Poslednja sinhronizacija {formatBusinessTime(board.data.serverTime)}</time>}
      {hasCapability(actor, 'RESERVATION_READ_ALL') && <Link to="/waitlist">Lista čekanja</Link>}
    </div>
    {!customStation&&!endStation&&!recoveryAction&&feedback}
    {board.error && board.data && <ErrorState title="Prikaz može biti zastareo" message="Proverite vezu i osvežite pre sledeće akcije." action={<Button onClick={() => board.refetch()}>Pokušaj ponovo</Button>} />}
    {board.isLoading && <div className="ops-kpis" aria-label="Učitavanje pregleda">{Array.from({ length: 4 }, (_, index) => <div className="ui-card" key={index}><Skeleton lines={2} /></div>)}</div>}
    {board.data && <>
      <section className="ops-kpis" aria-label="Pregled svih dostupnih stanica">
        <button type="button" className="ops-stat ops-stat--accent" onClick={() => url.apply({})}>
          <span>Ukupno računara</span><GamingOperationsIcon /><strong>{stations.length.toLocaleString('sr-RS')}</strong><small>Sve dostupne stanice</small></button>
        <button type="button" className="ops-stat" onClick={() => setFilters({ search: '', locationId: '', status: '', ready: '', sessions: 'true', offline: '', attention: '', expiring: '', stationId: '' })}>
          <span>Aktivne sesije</span><GamingOperationsIcon kind="play" /><strong>{activeCount.toLocaleString('sr-RS')}</strong><small>Pregled sesija →</small></button>
        <button type="button" className="ops-stat ops-stat--success" onClick={() => setFilters({ search: '', locationId: '', status: '', ready: 'true', sessions: '', offline: '', attention: '', expiring: '', stationId: '' })}>
          <span>Slobodni računari</span><GamingOperationsIcon /><strong>{readyCount.toLocaleString('sr-RS')}</strong><small>Dozvoljeno pokretanje →</small></button>
        <button type="button" className="ops-stat ops-stat--warning" onClick={() => alertFilter('attention')}>
          <span>Zahteva pažnju</span><GamingOperationsIcon kind="alert" /><strong>{attentionCount.toLocaleString('sr-RS')}</strong><small>Stanice za proveru →</small></button>
      </section>
      <div className="ops-alerts" role="group" aria-label="Globalna operativna upozorenja">
        <span>Za sve dostupne stanice</span>
        <button type="button" className="ops-alert ops-alert--danger" aria-pressed={url.state.offline === 'true'} onClick={() => alertFilter('offline')}><GamingOperationsIcon kind="connection" />Bez veze <strong>{offlineCount}</strong></button>
        <button type="button" className="ops-alert" aria-pressed={url.state.attention === 'true'} onClick={() => alertFilter('attention')}><GamingOperationsIcon kind="alert" />Potrebna intervencija <strong>{attentionCount}</strong></button>
        <button type="button" className="ops-alert" aria-pressed={url.state.expiring === 'true'} onClick={() => alertFilter('expiring')}><GamingOperationsIcon kind="clock" />Ističe za ≤10 min <strong>{expiringCount}</strong></button>
      </div>
    </>}
    <section className="ops-filters" aria-label="Filteri računara i sesija">
      <div className="ops-primary-filters" role="group" aria-label="Prikaz računara">
        {[{ key: 'all', label: 'Svi računari', count: stations.length }, { key: 'sessions', label: 'Aktivne sesije', count: activeCount },
          { key: 'ready', label: 'Slobodni računari', count: readyCount },
          { key: 'MAINTENANCE', label: 'Održavanje', count: stations.filter((station) => station.status === 'MAINTENANCE').length },
          { key: 'RETIRED', label: 'Van funkcije', count: stations.filter((station) => station.status === 'RETIRED').length }].map((filter) =>
          <button type="button" key={filter.key} aria-pressed={primary === filter.key} onClick={() => primaryFilter(filter.key)}>{filter.label}
            {board.data && <span>{filter.count}</span>}</button>)}
      </div>
      <div className="ops-filter-fields">
        <label className="ops-search">Pretraga<Input type="search" value={url.state.search} placeholder="Računar, klijent ili profil"
          onChange={(event) => setFilters({ search: event.target.value }, true)} /></label>
        <label>Lokacija<Select value={url.state.locationId} onChange={(event) => setFilters({ locationId: event.target.value })}>
          <option value="">Sve dodeljene lokacije</option>{locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
        <label>Status<Select value={url.state.status} onChange={(event) => setFilters({ status: event.target.value, ready: '', sessions: '', stationId: '' })}>
          <option value="">Sva stanja</option>{Object.entries(stationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label>Sortiranje<Select value={url.state.sort} onChange={(event) => setFilters({ sort: event.target.value })}>
          <option value="attention">Prvo za proveru</option><option value="name">Naziv računara</option><option value="expiry">Najbliži kraj sesije</option></Select></label>
      </div>
      <div className="ops-filter-options">
        <label className="inline-toggle"><input type="checkbox" checked={url.state.attention === 'true'} onChange={(event) => setFilters({ attention: event.target.checked ? 'true' : '' })} />Zahteva pažnju</label>
        <label className="inline-toggle"><input type="checkbox" checked={url.state.expiring === 'true'} onChange={(event) => setFilters({ expiring: event.target.checked ? 'true' : '' })} />Ističe u narednih 10 min</label>
        <label className="inline-toggle"><input type="checkbox" checked={url.state.offline === 'true'} onChange={(event) => setFilters({ offline: event.target.checked ? 'true' : '' })} />Bez veze</label>
        <Button type="button" variant="secondary" onClick={() => url.apply({})}>Poništi filtere</Button>
      </div>
      {url.state.stationId && <div className="ops-focused-filter">Filter izabrane stanice je aktivan.
        <Button type="button" variant="secondary" onClick={() => setFilters({ stationId: '' })}>Prikaži ostale računare</Button></div>}
    </section>
    <div className="ops-workspace">
      <section className="ops-stations" aria-labelledby="ops-stations-title">
        <div className="ops-section-heading"><h2 id="ops-stations-title">Računari</h2>{board.data && <span>{filtered.length} od {stations.length} stanica · 8 po stranici</span>}</div>
        {board.isLoading ? <div className="ops-station-grid">{Array.from({ length: 8 }, (_, index) => <div className="ui-card" key={index}><Skeleton lines={6} label="Učitavanje računara" /></div>)}</div> :
          !board.data && board.error ? <ErrorState message={apiErrorMessage(board.error, 'Gaming tabla nije dostupna.')} action={<Button onClick={() => void board.refetch()}>Pokušaj ponovo</Button>} /> :
          !stations.length ? <EmptyState title="Nema dostupnih stanica" description="Proverite konfiguraciju stanica i dodelu lokacija zaposlenom."
            action={hasCapability(actor, 'STATION_READ') && <Link to="/stations">Podešavanje stanica</Link>} /> :
          !filtered.length ? <EmptyState title="Nema stanica za izabrane filtere" action={<Button onClick={() => url.apply({})}>Prikaži sve stanice</Button>} /> :
          <div className="ops-station-grid">{pageStations.map((station) => <StationTile key={station.resourceId} station={station}
            seconds={stationSeconds(station, now)} selected={station.resourceId === selectedResourceId} disabled={disabled} handlers={handlers} onSelect={selectStation} />)}</div>}
        {board.data && <GamingBoardPagination page={stationPage} pageSize={stationPageSize} total={filtered.length} label="Stranice računara"
          onChange={(page) => url.set({ stationPage: String(page + 1) })} />}
      </section>
      {board.isLoading ? <div className="ui-card"><Skeleton lines={8} label="Učitavanje kontrolnog panela" /></div> :
        <StationDetailsPanel station={selectedStation} now={now} disabled={disabled} handlers={handlers} unavailable={!!selectedResourceId && !selectedStation}
          outsidePage={!!selectedStation && !pageStations.some((station) => station.resourceId === selectedResourceId)} />}
    </div>
    <section className="ui-card ops-sessions-panel" aria-labelledby="ops-sessions-title">
      <div className="ops-section-heading"><div><h2 id="ops-sessions-title">Aktivne sesije</h2><p>Trenutne sesije na dostupnim stanicama · primenjeni filteri · 10 po stranici</p></div>
        {board.data && <Badge tone="info">{sessions.length} sesija</Badge>}</div>
      {board.isLoading ? <Skeleton lines={5} label="Učitavanje aktivnih sesija" /> : !board.data && board.error ?
        <ErrorState message="Sesije trenutno nisu dostupne." action={<Button onClick={() => void board.refetch()}>Pokušaj ponovo</Button>} /> :
        !sessions.length ? <EmptyState title="Nema aktivnih sesija za ovaj prikaz" description={activeCount ? 'Promenite filtere da biste prikazali ostale sesije.' : 'Sesije će se pojaviti nakon pokretanja na dostupnim računarima.'} /> :
        <GamingSessionsTable stations={pageSessions} selectedId={selectedResourceId} now={now} disabled={disabled} handlers={handlers} onSelect={selectStation} />}
      {board.data && <GamingBoardPagination page={sessionPage} pageSize={sessionPageSize} total={sessions.length} label="Stranice aktivnih sesija"
        onChange={(page) => url.set({ sessionPage: String(page + 1) })} />}
    </section>
    {newSessionOpen && <StartSessionDialog station={startStation ?? undefined} onClose={() => { setNewSessionOpen(false); setStartStation(null) }} />}
    <Modal open={!!customStation} title="Prilagođeno produženje" closeDisabled={busy} onClose={() => { if (!busy) setCustomStation(null) }}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (customStation&&!hasPending) void extend(customStation, minutes) }}>
      {feedback}<label>Broj minuta<input required type="number" min={1} max={120} disabled={busy||hasPending} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label><Button type="submit" loading={busy} disabled={hasPending}>Produži sesiju</Button></form></Modal>
    <ConfirmDialog open={!!endStation} title={`Završi sesiju · ${endStation?.resourceName ?? ''}`} variant="danger"
      description={<><p>Sesija će biti završena i stanica će dobiti komandu za zaključavanje.</p>{feedback}</>}
      reasonLabel="Razlog završetka" reasonRequired loading={busy} disabled={hasPending} autoClose={false}
      confirmLabel="Potvrdi završetak" onClose={() => setEndStation(null)}
      onConfirm={async (reason) => { if (endStation && !hasPending && reason) await terminateRequest(endStation, reason) }} />
    <ActionDialog open={!!recoveryAction} title={recoveryAction?.confirm ? 'Potvrda fizičkog zaključavanja' : 'Ponovo pošalji force-lock'}
      description={`${recoveryAction?.station.resourceName ?? ''}: ${recoveryAction?.confirm ? 'Potvrdite tek nakon fizičke provere da je računar zaključan. Potvrda će biti evidentirana.' : 'Klijent će ponovo dobiti komandu za zaključavanje. Pratite potvrdu komande na kartici.'}${error ? ` ${error}` : ''}`}
      confirmLabel={recoveryAction?.confirm ? 'Provereno je zaključano' : 'Pošalji komandu'} danger loading={busy} error={error}
      onClose={() => { if (!busy) setRecoveryAction(null) }} onConfirm={recover} />
    <Modal open={!!historyStation} title={`Istorija stanice · ${liveHistoryStation?.resourceName ?? ''}`} onClose={() => setHistoryStation(null)}>
      {liveHistoryStation && <dl className="station-detail"><div><dt>Operativno / efektivno stanje</dt><dd>{liveHistoryStation.operationalStatus ?? liveHistoryStation.status} / {liveHistoryStation.effectiveStatus ?? liveHistoryStation.status}</dd></div>
        <div><dt>Profil / verzija</dt><dd>{liveHistoryStation.applicationProfileName ?? 'Nije podešen'} · {liveHistoryStation.configurationVersion ?? '—'}</dd></div>
        <div><dt>Client / heartbeat</dt><dd>{liveHistoryStation.clientVersion ?? 'Nije prijavljen'} · {liveHistoryStation.lastHeartbeatAt ? formatBusinessDateTime(liveHistoryStation.lastHeartbeatAt) : 'Nema heartbeat-a'}</dd></div>
        <div><dt>Lokalno zaključavanje</dt><dd>{enforcementLabels[liveHistoryStation.enforcementStatus]}{liveHistoryStation.lastLockAckAt && ` · ${formatBusinessDateTime(liveHistoryStation.lastLockAckAt)}`}</dd></div>
        <div><dt>Poslednja komanda</dt><dd>{liveHistoryStation.commandType ?? 'Nema komandi'} {liveHistoryStation.commandSequence && `#${liveHistoryStation.commandSequence}`} · {liveHistoryStation.commandAcknowledgedAt ? 'Potvrđena' : liveHistoryStation.commandSequence ? 'Čeka potvrdu' : '—'}</dd></div></dl>}
      {history.isLoading ? <Skeleton lines={5} label="Učitavanje istorije" /> : history.error ? <ErrorState message={apiErrorMessage(history.error, 'Istorija stanice nije dostupna.')} action={<Button onClick={() => history.refetch()}>Pokušaj ponovo</Button>} /> : !history.data?.entries.length ?
        <EmptyState title="Nema istorije" description="Za ovu stanicu još nema komandi ili enforcement događaja." /> : <ol className="timeline-list">{history.data.entries.map((entry, index) => <li key={`${entry.occurredAt}-${entry.commandSequence ?? index}`}>
          <time dateTime={entry.occurredAt}>{formatBusinessDateTime(entry.occurredAt)}</time><strong>{entry.action}</strong><Badge tone={entry.status === 'PENDING' ? 'warning' : 'neutral'}>{entry.status}</Badge>
          {entry.commandSequence !== undefined && <small>Komanda #{entry.commandSequence}</small>}{entry.correlationId && <code>Support ID: {entry.correlationId}</code>}{entry.details && <p>{entry.details}</p>}</li>)}</ol>}
    </Modal>
  </main>
}

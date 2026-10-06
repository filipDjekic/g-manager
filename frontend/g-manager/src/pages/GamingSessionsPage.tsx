import { useQuery, useQueryClient } from '@tanstack/react-query'
import { memo, useCallback, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { apiErrorMessage } from '../api/client'
import { IdempotencyKeyManager } from '../api/idempotency'
import { Badge, Button, EmptyState, ErrorState, Modal, PageHeader, Skeleton } from '../components/ui'
import { ActionDialog } from '../components/ui/ActionDialog'
import { useListUrlState } from '../lists/useListUrlState'
import { StartSessionDialog } from '../gaming/StartSessionDialog'
import { useGamingOperations } from '../gaming/useGamingOperations'
import { useServerNow } from '../gaming/useServerNow'
import { enforcementLabels, needsAttention, remaining, stationLabels, stationTones } from '../gaming/presentation'
import { formatBusinessDateTime, formatBusinessTime } from '../reservations/dateTime'
import type { GamingStationCard } from '../types/gamingSession.types'

const defaults = { search: '', locationId: '', status: '', attention: '', expiring: '', ready: '', sessions: '', offline: '', sort: 'attention', stationId: '' }
const allowed = Object.keys(defaults) as (keyof typeof defaults)[]

const StationTile = memo(function StationTile({ station, seconds, disabled, onStart, onExtend, onEnd, onCustom, onHistory, onRecovery }: {
  station: GamingStationCard; seconds: number; disabled: boolean
  onStart: (station: GamingStationCard) => void; onExtend: (station: GamingStationCard, minutes: number) => void
  onEnd: (station: GamingStationCard) => void; onCustom: (station: GamingStationCard) => void
  onHistory: (station: GamingStationCard) => void; onRecovery: (station: GamingStationCard, confirm: boolean) => void
}) {
  const pending = !!station.commandSequence && !station.commandAcknowledgedAt
  return <article id={`station-${station.resourceId}`} className={`gaming-station-card gaming-station-card--${station.status.toLowerCase().replace('_', '-')}`}>
    <header><div><small>{station.resourceCode}</small><h2>{station.resourceName}</h2></div><Badge tone={stationTones[station.status]}>{stationLabels[station.status]}</Badge></header>
    <p className="station-context">{station.locationName ?? 'Lokacija'}{station.areaName && ` / ${station.areaName}`}</p>
    <div className="station-signals">
      <Badge tone={!station.clientEnabled ? 'neutral' : station.staleHeartbeat ? 'danger' : 'success'}>
        {station.clientEnabled ? station.staleHeartbeat ? '● Veza zastarela' : '● Client online' : 'Ručni režim'}</Badge>
      <Badge tone={station.enforcementStatus === 'LOCK_PENDING' ? 'warning' : 'neutral'}>{enforcementLabels[station.enforcementStatus] ?? station.enforcementStatus}</Badge>
      {pending && <Badge tone="warning">Komanda #{station.commandSequence} čeka potvrdu</Badge>}
    </div>
    {station.sessionId ? <div className="gaming-session-summary">
      <p><span>Klijent</span><strong>{station.customerDisplayName ?? 'Klijent'}</strong></p>
      <strong className={`gaming-countdown${seconds <= 600 ? ' ending-soon' : ''}`} aria-label={`Preostalo vreme ${remaining(seconds)}`}>{remaining(seconds)}</strong>
      <p><span>Početak / kraj</span><strong>{station.startedAt && formatBusinessTime(station.startedAt)} — {station.endsAt && formatBusinessTime(station.endsAt)}</strong></p>
      {station.staleHeartbeat && <p className="station-warning">Sesija je aktivna na serveru. Proverite vezu i lokalno stanje računara.</p>}
    </div> : <p className="gaming-station-message">{station.allowedActions.includes('START') ? 'Spremna za novu sesiju' : station.status === 'LOCK_PENDING' ? 'Potrebna je potvrda lokalnog zaključavanja.' : station.status === 'OFFLINE' ? 'Proverite mrežu i Windows servis klijenta.' : station.status === 'AVAILABLE' ? 'Proverite podešavanje aplikacionog profila.' : 'Pokretanje sesije trenutno nije dozvoljeno.'}</p>}
    <p className="station-profile">Profil: <strong>{station.applicationProfileName ?? 'Nije podešen'}</strong></p>
    <footer className="form-actions">
      {station.allowedActions.includes('START') && <Button disabled={disabled} onClick={() => onStart(station)}>Pokreni sesiju</Button>}
      {station.allowedActions.includes('EXTEND') && <><Button variant="secondary" disabled={disabled} onClick={() => onExtend(station, 30)}>+30 min</Button>
        <Button variant="secondary" disabled={disabled} onClick={() => onExtend(station, 60)}>+60 min</Button><Button variant="secondary" disabled={disabled} onClick={() => onCustom(station)}>Drugo…</Button></>}
      {station.allowedActions.includes('TERMINATE') && <Button variant="danger" disabled={disabled} onClick={() => onEnd(station)}>Završi</Button>}
      {station.allowedActions.includes('FORCE_LOCK') && <Button variant="danger" disabled={disabled} onClick={() => onRecovery(station, false)}>Ponovo pošalji force-lock</Button>}
      {station.allowedActions.includes('CONFIRM_LOCKED') && <Button variant="secondary" disabled={disabled} onClick={() => onRecovery(station, true)}>Potvrdi fizički lock</Button>}
      <Button variant="secondary" onClick={() => onHistory(station)}>Detalji i istorija</Button>
    </footer>
  </article>
})

export function GamingSessionsPage() {
  const client = useQueryClient(), { board, connection, visible } = useGamingOperations()
  const url = useListUrlState(defaults, allowed), now = useServerNow(board.data?.serverTime)
  const [startStation, setStartStation] = useState<GamingStationCard | null>(null)
  const [customStation, setCustomStation] = useState<GamingStationCard | null>(null), [minutes, setMinutes] = useState(30)
  const [endStation, setEndStation] = useState<GamingStationCard | null>(null), [reason, setReason] = useState('')
  const [historyStation, setHistoryStation] = useState<GamingStationCard | null>(null)
  const [recoveryAction, setRecoveryAction] = useState<{ station: GamingStationCard; confirm: boolean } | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [hasPending,setHasPending]=useState(false)
  const pending=useRef<{kind:'EXTEND';station:GamingStationCard;minutes:number}|{kind:'TERMINATE';station:GamingStationCard;reason:string}|null>(null)
  const inFlight = useRef(false), keys = useRef(new Map<string, IdempotencyKeyManager>())
  const history = useQuery({ queryKey: ['gaming-operations', 'history', historyStation?.resourceId],
    queryFn: () => gamingSessionApi.history(historyStation!.resourceId), enabled: !!historyStation })
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
  async function terminate(event: FormEvent) {
    event.preventDefault();if(endStation&&!hasPending)await terminateRequest(endStation,reason.trim())
  }
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
  const openStart = useCallback((station: GamingStationCard) => { setError(''); setStartStation(station) }, [])
  const openCustom = useCallback((station: GamingStationCard) => { setError(''); setMinutes(30); setCustomStation(station) }, [])
  const openEnd = useCallback((station: GamingStationCard) => { setError(''); setReason(''); setEndStation(station) }, [])
  const openRecovery = useCallback((station: GamingStationCard, confirm: boolean) => { setError(''); setRecoveryAction({ station, confirm }) }, [])
  const stations = board.data?.stations ?? []
  const liveHistoryStation=stations.find(value=>value.resourceId===historyStation?.resourceId)??historyStation
  const locations = useMemo(() => [...new Map((board.data?.stations ?? []).map((value) => [value.locationId, value.locationName ?? 'Lokacija'])).entries()], [board.data])
  const filtered = stations.filter((station) => {
    const search = url.state.search.trim().toLocaleLowerCase('sr')
    return (!search || `${station.resourceName} ${station.resourceCode} ${station.customerDisplayName ?? ''} ${station.applicationProfileName ?? ''}`.toLocaleLowerCase('sr').includes(search))
      && (!url.state.locationId || station.locationId === url.state.locationId)
      && (!url.state.status || station.status === url.state.status)
      && (!url.state.stationId || station.resourceId === url.state.stationId)
      && (url.state.ready !== 'true' || station.allowedActions.includes('START'))
      && (url.state.sessions !== 'true' || !!station.sessionId)
      && (url.state.offline !== 'true' || station.staleHeartbeat || station.status === 'OFFLINE')
      && (url.state.attention !== 'true' || needsAttention(station))
      && (url.state.expiring !== 'true' || (!!station.sessionId && !!station.endsAt && Date.parse(station.endsAt) - now <= 600000))
  }).sort((a, b) => (url.state.sort === 'attention' ? Number(needsAttention(b)) - Number(needsAttention(a)) : url.state.sort === 'expiry' ?
    (a.endsAt ? Date.parse(a.endsAt) : Infinity) - (b.endsAt ? Date.parse(b.endsAt) : Infinity) : 0) || a.resourceName.localeCompare(b.resourceName, 'sr', { numeric: true }))

  return <main className="workspace gaming-operations">
    <PageHeader eyebrow="Gaming operativa" title="Kontrola gaming stanica" actions={<Button variant="secondary" loading={board.isFetching} onClick={() => board.refetch()}>Osveži</Button>} />
    <div className="live-status"><Badge tone={board.error ? 'danger' : connection === 'connected' && visible ? 'success' : 'warning'}>
      {board.error ? 'Osvežavanje nije uspelo' : !visible ? 'Osvežavanje pauzirano' : connection === 'connected' ? 'Live veza' : 'Periodično osvežavanje · 15 s'}</Badge>
      {board.data && <time dateTime={board.data.serverTime}>Poslednja sinhronizacija {formatBusinessTime(board.data.serverTime)}</time>}
      <Link to="/waitlist">Lista čekanja</Link>
    </div>
    {!customStation&&!endStation&&!recoveryAction&&feedback}
    {board.error && board.data && <ErrorState title="Prikaz može biti zastareo" message="Proverite vezu i osvežite pre sledeće akcije." action={<Button onClick={() => board.refetch()}>Pokušaj ponovo</Button>} />}
    {board.data && <section className="operations-metrics" aria-label="Pregled stanica">
      {[['Slobodne', stations.filter((s) => s.allowedActions.includes('START')).length, 'ready'], ['Sesije', stations.filter((s) => !!s.sessionId).length, 'sessions'],
        ['Bez veze', stations.filter((s) => s.staleHeartbeat || s.status === 'OFFLINE').length, 'offline'], ['Za proveru', stations.filter(needsAttention).length, 'attention']].map(([label, count, filter]) =>
        <button key={label} className="operation-metric" onClick={() => url.set({ status: '', ready:filter==='ready'?'true':'',sessions:filter==='sessions'?'true':'',offline:filter==='offline'?'true':'',attention: filter === 'attention' ? 'true' : '', expiring: '', stationId: '' })}>
          <span>{label}</span><strong>{count}</strong><small>Prikaži stanice →</small></button>)}
    </section>}
    <div className="operations-filters filter-bar">
      <label>Pretraga<input value={url.state.search} placeholder="Stanica, klijent ili profil" onChange={(event) => url.set({ search: event.target.value }, true)} /></label>
      <label>Lokacija<select value={url.state.locationId} onChange={(event) => url.set({ locationId: event.target.value })}><option value="">Sve dodeljene lokacije</option>{locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Status<select value={url.state.status} onChange={(event) => url.set({ status: event.target.value })}><option value="">Sva stanja</option>{Object.entries(stationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Redosled<select value={url.state.sort} onChange={(event) => url.set({ sort: event.target.value })}><option value="attention">Prvo za proveru</option><option value="name">Naziv stanice</option><option value="expiry">Najbliži kraj sesije</option></select></label>
    </div>
    <div className="operations-filter-options"><label className="inline-toggle"><input type="checkbox" checked={url.state.attention === 'true'} onChange={(e) => url.set({ attention: e.target.checked ? 'true' : '' })} /> Zahteva pažnju</label>
      <label className="inline-toggle"><input type="checkbox" checked={url.state.expiring === 'true'} onChange={(e) => url.set({ expiring: e.target.checked ? 'true' : '' })} /> Ističe u narednih 10 min</label>
      <span>{filtered.length} / {stations.length} stanica</span><Button variant="secondary" onClick={() => url.apply({})}>Poništi filtere</Button></div>
    {board.isLoading ? <Skeleton lines={8} label="Učitavanje gaming stanica" /> : !board.data && board.error ? <ErrorState message={apiErrorMessage(board.error, 'Gaming tabla nije dostupna.')} action={<Button onClick={() => board.refetch()}>Pokušaj ponovo</Button>} /> : !stations.length ?
      <EmptyState title="Nema dostupnih stanica" description="Proverite konfiguraciju stanica i dodelu lokacija zaposlenom." action={<Link to="/stations">Podešavanje stanica</Link>} /> : !filtered.length ?
      <EmptyState title="Nema stanica za izabrane filtere" action={<Button onClick={() => url.apply({})}>Prikaži sve stanice</Button>} /> :
      <section className="gaming-station-grid" aria-label="Gaming stanice">{filtered.map((station) => <StationTile key={station.resourceId} station={station}
        seconds={station.sessionId && station.endsAt ? Math.max(0, Math.ceil((Date.parse(station.endsAt) - now) / 1000)) : station.remainingSeconds}
        disabled={busy || hasPending || !!board.error} onStart={openStart} onExtend={extend} onEnd={openEnd} onCustom={openCustom} onHistory={setHistoryStation} onRecovery={openRecovery} />)}</section>}
    {startStation && <StartSessionDialog station={startStation} onClose={() => setStartStation(null)} />}
    <Modal open={!!customStation} title="Prilagođeno produženje" onClose={() => { if (!busy) setCustomStation(null) }}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (customStation&&!hasPending) void extend(customStation, minutes) }}>
      {feedback}<label>Broj minuta<input required type="number" min={1} max={120} disabled={busy||hasPending} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label><Button type="submit" loading={busy} disabled={hasPending}>Produži sesiju</Button></form></Modal>
    <Modal open={!!endStation} title={`Završi sesiju · ${endStation?.resourceName ?? ''}`} onClose={() => { if (!busy) setEndStation(null) }}><form className="form-grid" onSubmit={terminate}>
      {feedback}<label>Razlog završetka<textarea required disabled={busy||hasPending} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label><Button type="submit" variant="danger" loading={busy} disabled={!reason.trim()||hasPending}>Potvrdi završetak</Button></form></Modal>
    <ActionDialog open={!!recoveryAction} title={recoveryAction?.confirm ? 'Potvrda fizičkog zaključavanja' : 'Ponovo pošalji force-lock'}
      description={`${recoveryAction?.station.resourceName ?? ''}: ${recoveryAction?.confirm ? 'Potvrdite tek nakon fizičke provere da je računar zaključan. Potvrda će biti evidentirana.' : 'Klijent će ponovo dobiti komandu za zaključavanje. Pratite potvrdu komande na kartici.'}${error ? ` ${error}` : ''}`}
      confirmLabel={recoveryAction?.confirm ? 'Provereno je zaključano' : 'Pošalji komandu'} danger loading={busy} onClose={() => { if (!busy) setRecoveryAction(null) }} onConfirm={() => void recover()} />
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

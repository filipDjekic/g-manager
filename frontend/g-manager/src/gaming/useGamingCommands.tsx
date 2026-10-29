import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { IdempotencyKeyManager } from '../api/idempotency'
import { apiErrorMessage } from '../api/client'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { Alert, Button } from '../components/ui'
import type { GamingStationCard } from '../types/gamingSession.types'

export function useGamingCommands() {
  const client = useQueryClient()
  const [startStation, setStartStation] = useState<GamingStationCard | null>(null)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [customStation, setCustomStation] = useState<GamingStationCard | null>(null), [minutes, setMinutes] = useState(30)
  const [endStation, setEndStation] = useState<GamingStationCard | null>(null)
  const [historyStation, setHistoryStation] = useState<GamingStationCard | null>(null)
  const [recoveryAction, setRecoveryAction] = useState<{ station: GamingStationCard; confirm: boolean } | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [hasPending,setHasPending]=useState(false)
  useDirtyGuard(busy || hasPending, { pending: true })
  const pending=useRef<{kind:'EXTEND';station:GamingStationCard;minutes:number}|{kind:'TERMINATE';station:GamingStationCard;reason:string}|null>(null)
  const inFlight = useRef(false), keys = useRef(new Map<string, IdempotencyKeyManager>())
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: ['gaming-operations'] }), [client])
  const extend = useCallback(async (station: GamingStationCard, duration: number) => {
    if (!station.sessionId || station.sessionVersion === undefined || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    const signature = `extend:${station.sessionId}:${station.sessionVersion}:${duration}`
    const key = keys.current.get(signature) ?? new IdempotencyKeyManager(); keys.current.set(signature, key)
    try { await gamingSessionApi.extend(station.sessionId, duration, station.sessionVersion, key.begin()); keys.current.delete(signature);pending.current=null;setHasPending(false);setCustomStation(null) }
    catch (cause) { key.failed(cause);pending.current=key.pendingKey()?{kind:'EXTEND',station,minutes:duration}:null;setHasPending(!!pending.current);setError(apiErrorMessage(cause, 'Sesiju nije moguće produžiti.')) }
    finally { try { await refresh() } finally { inFlight.current = false; setBusy(false) } }
  }, [refresh])
  async function terminateRequest(station:GamingStationCard,endReason:string) {
    if (!station.sessionId || station.sessionVersion === undefined || !endReason || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    const signature = `end:${station.sessionId}:${station.sessionVersion}:${endReason}`
    const key = keys.current.get(signature) ?? new IdempotencyKeyManager(); keys.current.set(signature, key)
    try { await gamingSessionApi.terminate(station.sessionId,endReason,station.sessionVersion,key.begin());keys.current.delete(signature);pending.current=null;setHasPending(false);setEndStation(null) }
    catch (cause) { key.failed(cause);pending.current=key.pendingKey()?{kind:'TERMINATE',station,reason:endReason}:null;setHasPending(!!pending.current);setError(apiErrorMessage(cause, 'Sesiju nije moguće završiti.')) }
    finally { try { await refresh() } finally { inFlight.current = false; setBusy(false) } }
  }
  function retryPending() {
    const request=pending.current
    if(request?.kind==='EXTEND')void extend(request.station,request.minutes)
    else if(request)void terminateRequest(request.station,request.reason)
  }
  const feedback=error&&<Alert tone="danger" role="alert">{error}{hasPending&&<><p>Ishod komande nije potvrđen. Ponovite isti zahtev pre sledeće akcije.</p><Button type="button" variant="secondary" disabled={busy} onClick={retryPending}>Proveri prethodnu komandu</Button></>}</Alert>
  async function recover() {
    if (!recoveryAction || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      if (recoveryAction.confirm) await gamingSessionApi.confirmLocked(recoveryAction.station.resourceId)
      else await gamingSessionApi.forceLock(recoveryAction.station.resourceId)
      setRecoveryAction(null)
    } catch (cause) { setError(apiErrorMessage(cause, 'Recovery akcija nije uspela.')) }
    finally { try { await refresh() } finally { inFlight.current = false; setBusy(false) } }
  }
  const openStart = useCallback((station: GamingStationCard) => { setError(''); setStartStation(station); setNewSessionOpen(true) }, [])
  const openCustom = useCallback((station: GamingStationCard) => { setError(''); setMinutes(30); setCustomStation(station) }, [])
  const openEnd = useCallback((station: GamingStationCard) => { setError(''); setEndStation(station) }, [])
  const openRecovery = useCallback((station: GamingStationCard, confirm: boolean) => { setError(''); setRecoveryAction({ station, confirm }) }, [])
  return {
    startStation, setStartStation, newSessionOpen, setNewSessionOpen, customStation,
    setCustomStation, minutes, setMinutes, endStation, setEndStation,
    historyStation, setHistoryStation, recoveryAction, setRecoveryAction, error,
    setError, busy, hasPending, extend, terminateRequest,
    feedback, recover, openStart, openCustom, openEnd,
    openRecovery
  }
}

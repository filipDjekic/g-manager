import { apiClient } from './client'
import { connectAuthenticatedStream, consumeSse } from './sse'
import type { GamingOperationsBoard, GamingSession, GamingSessionEvent, GamingSessionVisit, StartGamingSessionInput, StationHistory } from '../types/gamingSession.types'

const command = (key:string) => ({ headers:{ 'Idempotency-Key':key } })
export const gamingSessionApi = {
  mine: () => apiClient.get<GamingSessionVisit[]>('/gaming-sessions/me').then(({data}) => data),
  customerVisits: (id:string) => apiClient.get<GamingSessionVisit[]>(`/gaming-sessions/customer/${id}`).then(({data}) => data),
  active: () => apiClient.get<GamingSession[]>('/gaming-sessions').then(({data}) => data),
  board: (locationId?:string) => apiClient.get<GamingOperationsBoard>('/gaming-operations/board',
    {params:locationId?{locationId}:undefined}).then(({data}) => data),
  get: (id:string) => apiClient.get<GamingSession>(`/gaming-sessions/${id}`).then(({data}) => data),
  start: (request:StartGamingSessionInput,key:string) =>
    apiClient.post<GamingSession>('/gaming-sessions',request,command(key)).then(({data}) => data),
  extend: (id:string,minutes:number,version:number,key:string) =>
    apiClient.post<GamingSession>(`/gaming-sessions/${id}/extend`,{minutes,version},command(key)).then(({data}) => data),
  terminate: (id:string,reason:string,version:number,key:string) =>
    apiClient.post<GamingSession>(`/gaming-sessions/${id}/terminate`,{reason,version},command(key)).then(({data}) => data),
  forceLock: (stationId:string) => apiClient.post(`/gaming-operations/stations/${stationId}/force-lock`),
  confirmLocked: (stationId:string) => apiClient.post(`/gaming-operations/stations/${stationId}/confirm-locked`),
  history: (stationId:string) => apiClient.get<StationHistory>(`/gaming-operations/stations/${stationId}/history`).then(({data})=>data),
}

export type GamingStreamState = 'connecting' | 'connected' | 'reconnecting'
export function connectGamingSessionStream(onEvent: (event: GamingSessionEvent) => void,
  onState?: (state: GamingStreamState) => void) {
  return connectAuthenticatedStream('/gaming-sessions/stream',
    () => onState?.('connected'),
    () => onState?.('reconnecting'),
    (stream, signal) => consumeSse(stream, 'gaming-session', (_id, data) => onEvent(JSON.parse(data) as GamingSessionEvent), signal))
}
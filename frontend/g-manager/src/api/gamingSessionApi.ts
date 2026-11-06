import type { PageResponse } from '../types/api.types'
import { apiClient } from './client'
import { connectAuthenticatedStream, consumeSse } from './sse'
import type { GamingOperationsBoard, GamingSession, GamingSessionEvent, GamingSessionVisit, StationHistory } from '../types/gamingSession.types'

const command = (key:string) => ({ headers:{ 'Idempotency-Key':key } })
export const gamingSessionApi = {
  finish: (id: string) => apiClient.post(`/gaming-sessions/${id}/finish`).then(r => r.data),
  health: () => apiClient.get<{ checkedAt:string;backend:string;database:string;financialLedger:string;backup?:string }>('/gaming-operations/health').then(({data})=>data),
  myHistory: (page: number, size: number) => apiClient.get<PageResponse<GamingSessionVisit>>('/gaming-sessions/me/history', { params: { page, size } }).then(({data}) => data),
  customerHistory: (id: string, page: number, size: number) => apiClient.get<PageResponse<GamingSessionVisit>>(`/gaming-sessions/customer/${id}/history`, { params: { page, size } }).then(({data}) => data),
  mine: () => apiClient.get<GamingSessionVisit[]>('/gaming-sessions/me/active').then(({data}) => data),
  customerVisits: (id:string) => apiClient.get<GamingSessionVisit[]>(`/gaming-sessions/customer/${id}/active`).then(({data}) => data),
  active: () => apiClient.get<GamingSession[]>('/gaming-sessions').then(({data}) => data),
  board: (locationId?:string) => apiClient.get<GamingOperationsBoard>('/gaming-operations/board',
    {params:locationId?{locationId}:undefined}).then(({data}) => data),
  get: (id:string) => apiClient.get<GamingSession>(`/gaming-sessions/${id}`).then(({data}) => data),
  terminate: (id:string,reason:string,version:number,key:string) =>
    apiClient.post<GamingSession>(`/gaming-sessions/${id}/terminate`,{reason,version},command(key)).then(({data}) => data),
  forceLock: (stationId:string) => apiClient.post(`/gaming-operations/stations/${stationId}/force-lock`),
  confirmLocked: (stationId:string) => apiClient.post(`/gaming-operations/stations/${stationId}/confirm-locked`),
  history: (stationId:string, page = 0, size = 20) => apiClient.get<PageResponse<StationHistory['entries'][number]>>(`/gaming-operations/stations/${stationId}/history`, { params: { page, size } }).then(({data})=>data),
}

export type GamingStreamState = 'connecting' | 'connected' | 'reconnecting'
export function connectGamingSessionStream(onEvent: (event: GamingSessionEvent) => void,
  onState?: (state: GamingStreamState) => void) {
  return connectAuthenticatedStream('/gaming-sessions/stream',
    () => onState?.('connected'),
    () => onState?.('reconnecting'),
    (stream, signal) => consumeSse(stream, 'gaming-session', (_id, data) => onEvent(JSON.parse(data) as GamingSessionEvent), signal))
}

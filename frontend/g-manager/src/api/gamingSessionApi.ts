import { apiClient } from './client'
import type { GamingSession, StartGamingSessionInput } from '../types/gamingSession.types'

const command = (key:string) => ({ headers:{ 'Idempotency-Key':key } })
export const gamingSessionApi = {
  active: () => apiClient.get<GamingSession[]>('/gaming-sessions').then(({data}) => data),
  get: (id:string) => apiClient.get<GamingSession>(`/gaming-sessions/${id}`).then(({data}) => data),
  start: (request:StartGamingSessionInput,key:string) =>
    apiClient.post<GamingSession>('/gaming-sessions',request,command(key)).then(({data}) => data),
  extend: (id:string,minutes:number,version:number,key:string) =>
    apiClient.post<GamingSession>(`/gaming-sessions/${id}/extend`,{minutes,version},command(key)).then(({data}) => data),
  terminate: (id:string,reason:string,version:number,key:string) =>
    apiClient.post<GamingSession>(`/gaming-sessions/${id}/terminate`,{reason,version},command(key)).then(({data}) => data),
}

import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type { GamingSession } from '../types/gamingSession.types'
export interface TimeAccount { customerId: string; serverTime: string; balanceSeconds: number; activeSession?: GamingSession; consumedSeconds?: number; resourceName?: string; assignments: StationAssignment[] }
export interface StationAssignment { id: string; customer_id: string; resource_id: string; status: string; expires_at: string }
export interface TimeEntry { id: string; delta_seconds: number; balance_after: number; kind: string; reason?: string; created_at: string }
export interface ManualPayment { id: string; amount: string | number; granted_seconds: number; kind: string; method: string; reason?: string; reference?: string; actor_id: string; created_at: string }
export type GamingPaymentMethod = 'CASH' | 'EXTERNAL_POS'
export interface TimeGrant { minutes: number; priceVersion: number; method?: GamingPaymentMethod; reference?: string }
export interface GamingTimePrice { pricePerMinute: string | number | null; version: number }
const headers = (key: string) => ({ headers: { 'Idempotency-Key': key } })
export const gamingTimeApi = {
  price: () => apiClient.get<GamingTimePrice>('/gaming-billing/time-price').then(r => r.data),
  savePrice: (body: GamingTimePrice) => apiClient.put<GamingTimePrice>('/gaming-billing/time-price', body).then(r => r.data),
  account: (id: string) => apiClient.get<TimeAccount>(`/gaming-billing/customers/${id}/time`).then(r => r.data),
  history: <T,>(id: string, kind: 'ledger' | 'transactions' | 'historical-transactions', page: number, size: number) => apiClient.get<PageResponse<T>>(`/gaming-billing/customers/${id}/time/${kind}`, { params: { page, size } }).then(r => r.data),
  grant: (id: string, body: TimeGrant, key: string) => apiClient.post(`/gaming-billing/customers/${id}/time-grants`, body, headers(key)),
  assign: (body: { customerId: string; resourceId: string; reservationId?: string }, key: string) => apiClient.post<StationAssignment>('/gaming-billing/assignments', body, headers(key)).then(r => r.data),
  cancel: (id: string, key: string) => apiClient.post(`/gaming-billing/assignments/${id}/cancel`, {}, headers(key)),
}

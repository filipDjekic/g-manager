import type { PageResponse } from '../types/api.types'
import { apiClient } from './client'
export type Money = string | number
export interface FinanceReport { timeBalanceSeconds: number; manualTime: Record<string, string | number>; currency: string; totals: Record<string, string | number>; historical: Record<string, string | number>; historicalMoneyBalance: Money; recorded: Record<string, string | number>[]; sessions: Record<string, string | number>[]; productOrders: Record<string, string | number>[] }
const headers = (key: string) => ({ headers: { 'Idempotency-Key': key } })
export const gamingBillingApi = {
  reportDetails: (table: string, from: string, until: string, page: number, size: number) => apiClient.get<PageResponse<Record<string, string | number>>>(`/gaming-billing/report/${table}`, { params: { from, until, page, size } }).then(r => r.data),
  preparation: (id: string) => apiClient.get<{ ready: boolean; session_id?: string }>(`/gaming-operations/stations/${id}/preparation`).then(r => r.data),
  prepare: (id: string, body: unknown, key: string) => apiClient.post(`/gaming-operations/stations/${id}/prepare`, body, headers(key)),
  report: (from: string, until: string) => apiClient.get<FinanceReport>('/gaming-billing/report', { params: { from, until } }).then(r => r.data),
}

import type { PageResponse } from '../types/api.types'
import { apiClient } from './client'
export type Money = string | number
export interface FinancialOperation { id: string; amount: Money; currency: string; kind: string; method: string; status: string; reason?: string; reference?: string; created_at: string }
export interface Account { billingMode?: string; customerId?: string; sessionId: string; due: Money; currency: string; receiptType: string; charges: { id: string; amount: Money; minutes: number; billed_seconds?: number; snapshot: string }[]; transactions: FinancialOperation[] }
export interface FinanceReport { timeBalanceSeconds: number; manualTime: Record<string, string | number>; currency: string; totals: Record<string, string | number>; archivedPackageSales: Money; recorded: Record<string, string | number>[]; outstandingDebt: Money; prepaidLiability: Money; sessions: Record<string, string | number>[]; productOrders: Record<string, string | number>[] }
const headers = (key: string) => ({ headers: { 'Idempotency-Key': key } })
export const gamingBillingApi = {
  reportDetails: (table: string, from: string, until: string, page: number, size: number) => apiClient.get<PageResponse<Record<string, string | number>>>(`/gaming-billing/report/${table}`, { params: { from, until, page, size } }).then(r => r.data),
  account: (id: string) => apiClient.get<Account>(`/gaming-billing/sessions/${id}`).then(r => r.data),
  preparation: (id: string) => apiClient.get<{ ready: boolean; session_id?: string }>(`/gaming-operations/stations/${id}/preparation`).then(r => r.data),
  prepare: (id: string, body: unknown, key: string) => apiClient.post(`/gaming-operations/stations/${id}/prepare`, body, headers(key)),
  report: (from: string, until: string) => apiClient.get<FinanceReport>('/gaming-billing/report', { params: { from, until } }).then(r => r.data),
}

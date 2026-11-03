import { apiClient } from './client'
export type Money = string | number
export type PaymentMethod = 'CASH' | 'EXTERNAL_POS' | 'WALLET' | 'TIME_PACKAGE'
export interface Payment { method: PaymentMethod; amount: Money; reference?: string }
export interface Purchase { tariffId: string; tariffVersion: number; discountPercent?: Money; reason?: string; payment: Payment; packageId?: string }
export interface Tariff { id: string; name: string; serviceId?: string; minutes: number; price: Money; currency: string; active: boolean; validFrom?: string; validUntil?: string; packageValidityDays: number; version: number }
export interface BillingPolicy { allowPartialPayment: boolean; allowDebt: boolean; allowRefunds: boolean; minimumMinutes: number; maximumMinutes: number; employeeDiscountLimit: Money; version: number }
export interface Quote { tariffId: string; tariffVersion: number; tariffName: string; minutes: number; gross: Money; discount: Money; total: Money; currency: string; rule: string }
export interface FinancialOperation { id: string; amount: Money; currency: string; kind: string; method: string; status: string; reason?: string; reference?: string; created_at: string }
export interface Account { sessionId: string; due: Money; currency: string; receiptType: string; charges: { id: string; amount: Money; minutes: number; snapshot: string }[]; transactions: FinancialOperation[] }
export interface TimePackage { id: string; remaining_minutes: number; minutes: number; price: Money; expires_at?: string; service_id?: string; tariff_id: string }
export interface Wallet { serverTime?: string; customerId: string; balance: Money; currency: string; packages: TimePackage[]; transactions: FinancialOperation[]; ledger: { id: string; kind: string; amount: Money; minutes: number; created_at: string; reason?: string }[] }
const headers = (key: string) => ({ headers: { 'Idempotency-Key': key } })
export const gamingBillingApi = {
  tariffs: () => apiClient.get<Tariff[]>('/gaming-billing/tariffs').then(r => r.data),
  policy: () => apiClient.get<BillingPolicy>('/gaming-billing/policy').then(r => r.data),
  savePolicy: (p: BillingPolicy) => apiClient.put<BillingPolicy>('/gaming-billing/policy', p).then(r => r.data),
  saveTariff: (t: Omit<Tariff, 'id' | 'currency'> & { id?: string }, key: string) => (t.id ? apiClient.put<Tariff>(`/gaming-billing/tariffs/${t.id}`, t) : apiClient.post<Tariff>('/gaming-billing/tariffs', t, headers(key))).then(r => r.data),
  quote: (resourceId: string, tariffId: string, minutes: number, discount: string, packageId?: string) => apiClient.get<Quote>('/gaming-billing/quote', { params: { resourceId, tariffId: tariffId || undefined, minutes, discount, packageId } }).then(r => r.data),
  account: (id: string) => apiClient.get<Account>(`/gaming-billing/sessions/${id}`).then(r => r.data),
  pay: (id: string, payment: Payment, key: string) => apiClient.post(`/gaming-billing/sessions/${id}/payments`, { payment }, headers(key)),
  refund: (id: string, paymentId: string, amount: string, reason: string, key: string) => apiClient.post(`/gaming-billing/sessions/${id}/refunds`, { paymentId, amount, reason }, headers(key)),
  wallet: (id: string) => apiClient.get<Wallet>(`/gaming-billing/customers/${id}`).then(r => r.data),
  walletChange: (id: string, action: 'topups' | 'packages' | 'adjustments' | 'refunds', body: unknown, key: string) => apiClient.post(`/gaming-billing/customers/${id}/${action}`, body, headers(key)),
  preparation: (id: string) => apiClient.get<{ ready: boolean; session_id?: string }>(`/gaming-operations/stations/${id}/preparation`).then(r => r.data),
  prepare: (id: string, body: unknown, key: string) => apiClient.post(`/gaming-operations/stations/${id}/prepare`, body, headers(key)),
  report: (from: string, until: string) => apiClient.get<FinanceReport>('/gaming-billing/report', { params: { from, until } }).then(r => r.data),
}
export interface FinanceReport { currency: string; totals: Record<string, string | number>; activePackageLiability: Money; recorded: Record<string, string | number>[]; byStation: Record<string, string | number>[]; byLocation: Record<string, string | number>[]; byEmployee: Record<string, string | number>[]; outstandingDebt: Money; prepaidLiability: Money; packages: TimePackage[]; sessions: Record<string, string | number>[]; productOrders: Record<string, string | number>[] }

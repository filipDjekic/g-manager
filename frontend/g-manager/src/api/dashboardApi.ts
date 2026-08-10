import { apiClient } from './client'
import type { DashboardSummary, DashboardToday, DashboardTrends, DashboardWidgetPreference, DashboardWorkload } from '../types/dashboard.types'

export const dashboardApi = {
  summary: (from: string, to: string) =>
    apiClient.get<DashboardSummary>('/dashboard/summary', { params: { from, to } })
      .then(({ data }) => data),
  today: () =>
    apiClient.get<DashboardToday>('/dashboard/today').then(({ data }) => data),
  trends: (from: string, to: string) =>
    apiClient.get<DashboardTrends>('/dashboard/trends', { params: { from, to } }).then(({ data }) => data),
  workload: (from: string, to: string, employeeId?: string) =>
    apiClient.get<DashboardWorkload>('/dashboard/workload', { params: { from, to, employeeId } }).then(({ data }) => data),
  preferences: () => apiClient.get<DashboardWidgetPreference[]>('/dashboard/widget-preferences').then(({ data }) => data),
  savePreferences: (items: DashboardWidgetPreference[]) =>
    apiClient.put<DashboardWidgetPreference[]>('/dashboard/widget-preferences', items).then(({ data }) => data),
  export: (from: string, to: string, view: 'current' | 'raw', employeeId?: string) =>
    apiClient.get<Blob>('/dashboard/export', { params: { from, to, view, employeeId }, responseType: 'blob' }).then(({ data }) => data),
}

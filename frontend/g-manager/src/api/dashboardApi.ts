import { apiClient } from './client'
import type { DashboardSummary, DashboardToday } from '../types/dashboard.types'

export const dashboardApi = {
  summary: (from: string, to: string) =>
    apiClient.get<DashboardSummary>('/dashboard/summary', { params: { from, to } })
      .then(({ data }) => data),
  today: () =>
    apiClient.get<DashboardToday>('/dashboard/today').then(({ data }) => data),
}

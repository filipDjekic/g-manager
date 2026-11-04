import type { PageResponse } from '../types/api.types'
import { apiClient } from './client'
import type { TimeOff, TimeOffInput, TimeOffStatus } from '../types/timeOff.types'

export const timeOffApi = {
  summary: () => apiClient.get<{ totalElements: number }>('/time-off/summary').then(({data}) => data),
  page: (params: { search?: string; status?: string; employeeId?: string; from?: string; to?: string; page: number; size: number }) => apiClient.get<PageResponse<TimeOff>>('/time-off/page', { params }).then(({data}) => data),
  list: (page = 0, size = 10) => apiClient.get<PageResponse<TimeOff>>('/time-off', { params: { page, size } }).then(({ data }) => data),
  create: (input: TimeOffInput) =>
    apiClient.post<TimeOff>('/time-off', input).then(({ data }) => data),
  decide: (item: TimeOff, status: TimeOffStatus, reason?: string) =>
    apiClient.patch<TimeOff>(`/time-off/${item.id}/status`, {
      status,
      version: item.version,
      reason,
    }).then(({ data }) => data),
}

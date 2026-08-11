import { apiClient } from './client'
import type { TimeOff, TimeOffInput, TimeOffStatus } from '../types/timeOff.types'

export const timeOffApi = {
  list: () => apiClient.get<TimeOff[]>('/time-off').then(({ data }) => data),
  create: (input: TimeOffInput) =>
    apiClient.post<TimeOff>('/time-off', input).then(({ data }) => data),
  decide: (item: TimeOff, status: TimeOffStatus) =>
    apiClient.patch<TimeOff>(`/time-off/${item.id}/status`, {
      status,
      version: item.version,
    }).then(({ data }) => data),
}

import { apiClient } from './client'
import type { WaitlistEntry, WaitlistOperationalEntry, WaitlistFilters, WaitlistDetail, WaitlistStatistics, ManageWaitlistInput } from '../types/waitlist.types'
import type { PageResponse } from '../types/api.types'

export const waitlistApi = {
  operational: (params: WaitlistFilters) =>
    apiClient.get<PageResponse<WaitlistOperationalEntry>>('/waitlist', {params}).then(({data}) => data),
  statistics: () => apiClient.get<WaitlistStatistics>('/waitlist/statistics').then(({ data }) => data),
  detail: (id: string) => apiClient.get<WaitlistDetail>(`/waitlist/management/${encodeURIComponent(id)}`).then(({ data }) => data),
  managementScope: () => apiClient.get<{allResources: boolean; resourceIds: string[]; locationIds: string[]}>('/waitlist/management-scope').then(({ data }) => data),
  createManaged: (input: ManageWaitlistInput, key: string) =>
    apiClient.post<WaitlistDetail>('/waitlist/management', input, { headers: {'Idempotency-Key': key} }).then(({ data }) => data),
  updateManaged: (id: string, input: ManageWaitlistInput) =>
    apiClient.patch<WaitlistDetail>(`/waitlist/management/${encodeURIComponent(id)}`, input).then(({ data }) => data),
  cancelManaged: (id: string, version: number, reason: string) =>
    apiClient.delete<void>(`/waitlist/management/${encodeURIComponent(id)}`, { data: {version, reason} }),
  mine: () => apiClient.get<WaitlistEntry[]>('/waitlist/me').then(({ data }) => data),
  join: (input: { serviceId: string; employeeId: string; resourceId?: string; locationId?: string; desiredStart: string }) =>
    apiClient.post<WaitlistEntry>('/waitlist', input).then(({ data }) => data),
  accept: (offerId: string) =>
    apiClient.post<WaitlistEntry>(`/waitlist/offers/${offerId}/accept`).then(({ data }) => data),
  cancel: (entry: WaitlistEntry) =>
    apiClient.delete(`/waitlist/${entry.id}`, { params: { version: entry.version } }),
}

import { apiClient } from './client'
import type { WaitlistEntry, WaitlistOperationalEntry } from '../types/waitlist.types'
import type { PageResponse } from '../types/api.types'

export const waitlistApi = {
  operational: (params: { status?: 'WAITING'|'OFFERED'; search?: string; customerId?:string; page:number; size:number }) =>
    apiClient.get<PageResponse<WaitlistOperationalEntry>>('/waitlist', {params}).then(({data}) => data),
  mine: () => apiClient.get<WaitlistEntry[]>('/waitlist/me').then(({ data }) => data),
  join: (input: { serviceId: string; employeeId: string; resourceId?: string; desiredStart: string }) =>
    apiClient.post<WaitlistEntry>('/waitlist', input).then(({ data }) => data),
  accept: (offerId: string) =>
    apiClient.post<WaitlistEntry>(`/waitlist/offers/${offerId}/accept`).then(({ data }) => data),
  cancel: (entry: WaitlistEntry) =>
    apiClient.delete(`/waitlist/${entry.id}`, { params: { version: entry.version } }),
}

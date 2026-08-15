import { apiClient } from './client'
import type { WaitlistEntry } from '../types/waitlist.types'

export const waitlistApi = {
  mine: () => apiClient.get<WaitlistEntry[]>('/waitlist/me').then(({ data }) => data),
  join: (input: { serviceId: string; employeeId: string; resourceId?: string; desiredStart: string }) =>
    apiClient.post<WaitlistEntry>('/waitlist', input).then(({ data }) => data),
  accept: (offerId: string) =>
    apiClient.post<WaitlistEntry>(`/waitlist/offers/${offerId}/accept`).then(({ data }) => data),
  cancel: (entry: WaitlistEntry) =>
    apiClient.delete(`/waitlist/${entry.id}`, { params: { version: entry.version } }),
}

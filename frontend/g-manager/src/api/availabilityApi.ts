import { apiClient } from './client'
import type { AvailabilityResponse } from '../types/availability.types'

export const availabilityApi = {
  find: (params: { serviceId: string; employeeId?: string; from: string; to: string }) =>
    apiClient.get<AvailabilityResponse>('/availability', { params }).then(({ data }) => data),
}

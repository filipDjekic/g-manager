import { apiClient } from './client'
import type { AvailabilityResponse } from '../types/availability.types'

export const availabilityApi = {
  overview: (params: { serviceId: string; employeeId?: string; resourceId?:string; locationId?:string; from: string; to: string }) =>
    apiClient.get<AvailabilityResponse>('/availability/overview', { params }).then(({ data }) => data),
  find: (params: { serviceId: string; employeeId?: string; resourceId?:string; locationId?:string; from: string; to: string }) =>
    apiClient.get<AvailabilityResponse>('/availability', { params }).then(({ data }) => data),
}

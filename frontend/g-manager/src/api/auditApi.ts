import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type { AuditEvent } from '../types/audit.types'

export interface AuditFilters {
  action?: string; resourceType?: string; actorId?: string
  from?: string; to?: string; page: number; size: number
}

export const auditApi = {
  list: (params: AuditFilters) =>
    apiClient.get<PageResponse<AuditEvent>>('/audit-events', { params }).then(({ data }) => data),
  get: (id: string) => apiClient.get<AuditEvent>(`/audit-events/${id}`).then(({ data }) => data),
}

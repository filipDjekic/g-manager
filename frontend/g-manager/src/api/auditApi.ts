import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type { AuditEvent, AuditStatistics } from '../types/audit.types'

export interface AuditFilters {
  action?: string; resourceType?: string; actorId?: string
  from?: string; to?: string; page: number; size: number
  search?: string; sort?: string; direction?: 'ASC' | 'DESC'
}

export type AuditCriteria = Omit<AuditFilters, 'page' | 'size' | 'sort' | 'direction'>

export const auditApi = {
  list: (params: AuditFilters, signal?: AbortSignal) =>
    apiClient.get<PageResponse<AuditEvent>>('/audit-events', { params, signal }).then(({ data }) => data),
  get: (id: string, signal?: AbortSignal) => apiClient.get<AuditEvent>(`/audit-events/${id}`, { signal }).then(({ data }) => data),
  statistics: (params: AuditCriteria, signal?: AbortSignal) =>
    apiClient.get<AuditStatistics>('/audit-events/statistics', { params, signal }).then(({ data }) => data),
}

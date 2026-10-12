import type { Role } from './auth.types'

export interface AuditEvent {
  id: string
  actorId: string
  actorRole: Role
  action: string
  resourceType: string
  resourceId: string
  beforeData: string | null
  afterData: string | null
  reason: string | null
  occurredAt: string
  category: 'CREATE' | 'UPDATE' | 'DELETE' | 'DEACTIVATE' | 'OTHER'
}

export interface AuditStatistics {
  total: number
  created: number
  updated: number
  removed: number
  creationActions: string[]
  updateActions: string[]
  removalActions: string[]
}

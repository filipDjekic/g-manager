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
}

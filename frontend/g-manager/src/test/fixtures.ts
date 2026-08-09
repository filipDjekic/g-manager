import type { AuthResponse, AuthUser, Permission, Role } from '../types/auth.types'

const permissions: Record<Role, Permission[]> = {
  OWNER: ['PROFILE_READ', 'USER_LIST', 'WORKING_HOURS_MANAGE', 'DASHBOARD_SUMMARY', 'AUDIT_READ'],
  ADMIN: ['PROFILE_READ', 'USER_LIST', 'WORKING_HOURS_MANAGE', 'DASHBOARD_SUMMARY', 'AUDIT_READ'],
  EMPLOYEE: ['PROFILE_READ', 'DASHBOARD_OPERATIONAL', 'RESERVATION_READ_ALL', 'ORDER_READ_ALL'],
  CUSTOMER: ['PROFILE_READ', 'RESERVATION_CREATE', 'RESERVATION_READ_OWN', 'ORDER_CREATE', 'ORDER_READ_OWN'],
}

export function authUser(role: Role, overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: `00000000-0000-0000-0000-${role.toLowerCase().padEnd(12, '0')}`,
    name: `${role} Test`,
    email: `${role.toLowerCase()}@example.test`,
    role,
    active: true,
    permissions: permissions[role],
    ...overrides,
  }
}

export function authResponse(role: Role): AuthResponse {
  return { token: `synthetic-${role.toLowerCase()}-token`, expiresAt: '2030-01-01T00:00:00Z', user: authUser(role) }
}

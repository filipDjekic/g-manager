import type { AuthResponse, AuthUser, Role } from '../types/auth.types'
import { roleCapabilities } from '../auth/capabilities'

export function authUser(role: Role, overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: `00000000-0000-0000-0000-${role.toLowerCase().padEnd(12, '0')}`,
    name: `${role} Test`,
    email: `${role.toLowerCase()}@example.test`,
    role,
    active: true,
    permissions: [...roleCapabilities[role]],
    ...overrides,
  }
}

export function authResponse(role: Role): AuthResponse {
  return { token: `synthetic-${role.toLowerCase()}-token`, expiresAt: '2030-01-01T00:00:00Z', user: authUser(role) }
}

export function pageResponse<T>(content: T[], size = 10) {
  return { content, page: 0, size, totalElements: content.length, totalPages: Math.ceil(content.length / size) }
}

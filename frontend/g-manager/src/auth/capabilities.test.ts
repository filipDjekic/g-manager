import { describe, expect, it } from 'vitest'
import { hasCapability, roleCapabilities } from './capabilities'
import type { Permission } from '../types/auth.types'

describe('capability model', () => {
  it('keeps the complete role capability matrix explicit', () => {
    expect(roleCapabilities.CUSTOMER).toContain('ORDER_READ_OWN')
    expect(roleCapabilities.CUSTOMER).toContain('RESOURCE_READ')
    expect(roleCapabilities.CUSTOMER).not.toContain('ORDER_READ_ALL')
    expect(roleCapabilities.EMPLOYEE).toContain('ORDER_READ_ALL')
    expect(roleCapabilities.EMPLOYEE).toContain('CUSTOMER_CREATE')
    expect(roleCapabilities.EMPLOYEE).not.toContain('USER_LIST')
    expect(roleCapabilities.ADMIN).toContain('USER_LIST')
    expect(roleCapabilities.ADMIN).toContain('RESOURCE_MANAGE')
    expect(roleCapabilities.OWNER).toContain('USER_DEACTIVATE')
  })

  it('prefers capabilities supplied by the authenticated session', () => {
    const user = {
      id: 'id', name: 'Admin', email: 'admin@example.test', role: 'ADMIN' as const,
      active: true, permissions: ['PROFILE_READ'] as Permission[],
    }
    expect(hasCapability(user, 'PROFILE_READ')).toBe(true)
    expect(hasCapability(user, 'USER_LIST')).toBe(false)
  })
})

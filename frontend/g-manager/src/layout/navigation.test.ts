import { describe, expect, it } from 'vitest'
import { roleCapabilities } from '../auth/capabilities'
import { authUser } from '../test/fixtures'
import type { FeatureFlagKey } from '../types/feature.types'
import { equipmentItems, homeForRole, homeForUser, managementItems, navigationFor, permittedItems, toolItems } from './navigation'

const flags: Record<FeatureFlagKey, boolean> = {
  REPORTS: true, PWA_OFFLINE: true, AI_ASSISTANT: false,
}
const user = (role: 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER') =>
  authUser(role, { permissions: roleCapabilities[role] })
const paths = (role: 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER', values = flags) =>
  navigationFor(user(role), values).flatMap((group) => group.items.map((item) => item.to))

describe('role-aware product navigation', () => {
  it('gives customers a focused task navigation without management links', () => {
    expect(paths('CUSTOMER')).toEqual([
      '/home', '/my-reservations?booking=new', '/my-reservations', '/catalog',
    ])
    expect(homeForRole('CUSTOMER')).toBe('/home')
  })

  it('puts employee operational work first', () => {
    const groups = navigationFor(user('EMPLOYEE'), flags)
    expect(groups[0]).toMatchObject({ label: 'Radni prostor' })
    expect(groups[0].items[0]).toMatchObject({ to: '/dashboard' })
    expect(paths('EMPLOYEE')).toContain('/calendar')
    expect(paths('EMPLOYEE')).toContain('/customers')
    expect(paths('EMPLOYEE')).toContain('/tools')
    expect(permittedItems(user('EMPLOYEE'), flags, toolItems).map(item => item.to))
      .toEqual(expect.arrayContaining(['/resources', '/stations', '/catalog']))
    expect(paths('EMPLOYEE')).not.toContain('/users')
    expect(homeForRole('EMPLOYEE')).toBe('/dashboard')
  })

  it('groups management links and respects feature flags and explicit permissions', () => {
    const groups = navigationFor(user('OWNER'), { ...flags, REPORTS: false })
    expect(groups.map((group) => group.label)).toEqual([
      'Radni prostor',
    ])
    expect(permittedItems(user('OWNER'), { ...flags, REPORTS: false }, managementItems).map(item => item.to)).not.toContain('/reports')
    expect(permittedItems(user('OWNER'), flags, managementItems).map(item => item.to)).toContain('/reports')
    expect(paths('OWNER')).toContain('/calendar')
    expect(paths('OWNER')).toContain('/customers')
    expect(paths('OWNER')).toContain('/equipment')
    expect(permittedItems(user('OWNER'), flags, equipmentItems).map(item => item.to)).toContain('/stations')
    expect(paths('OWNER')).toContain('/gaming-sessions')
    const profileOnly = authUser('OWNER', { permissions: ['PROFILE_READ'] })
    expect(navigationFor(profileOnly, flags)).toEqual([])
    expect(homeForUser(profileOnly, flags)).toBe('/profile')
    expect(permittedItems(profileOnly, flags, [...managementItems, ...equipmentItems, ...toolItems])).toEqual([])
  })
})

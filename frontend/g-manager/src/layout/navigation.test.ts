import { describe, expect, it } from 'vitest'
import { roleCapabilities } from '../auth/capabilities'
import { authUser } from '../test/fixtures'
import type { FeatureFlagKey } from '../types/feature.types'
import { homeForRole, navigationFor } from './navigation'

const flags: Record<FeatureFlagKey, boolean> = {
  REPORTS: true, WORKFLOWS: true, PWA_OFFLINE: true, AI_ASSISTANT: false,
}
const user = (role: 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER') =>
  authUser(role, { permissions: roleCapabilities[role] })
const paths = (role: 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER', values = flags) =>
  navigationFor(user(role), values).flatMap((group) => group.items.map((item) => item.to))

describe('role-aware product navigation', () => {
  it('gives customers a focused task navigation without management links', () => {
    expect(paths('CUSTOMER')).toEqual(expect.arrayContaining([
      '/catalog', '/my-reservations', '/my-orders', '/profile', '/notification-preferences',
    ]))
    expect(paths('CUSTOMER')).not.toEqual(expect.arrayContaining(['/dashboard', '/users', '/audit', '/reports']))
    expect(homeForRole('CUSTOMER')).toBe('/catalog')
  })

  it('puts employee operational work first', () => {
    const groups = navigationFor(user('EMPLOYEE'), flags)
    expect(groups[0]).toMatchObject({ label: 'Danas' })
    expect(groups[0].items[0]).toMatchObject({ to: '/dashboard' })
    expect(paths('EMPLOYEE')).not.toContain('/users')
    expect(homeForRole('EMPLOYEE')).toBe('/dashboard')
  })

  it('groups management links and respects feature flags and explicit permissions', () => {
    const groups = navigationFor(user('OWNER'), { ...flags, REPORTS: false })
    expect(groups.map((group) => group.label)).toEqual([
      'Pregled', 'Poslovanje', 'Ljudi', 'Upravljanje', 'Sistem', 'Moj nalog',
    ])
    expect(groups.flatMap((group) => group.items.map((item) => item.to))).not.toContain('/reports')
    expect(navigationFor(authUser('OWNER', { permissions: ['PROFILE_READ'] }), flags)
      .flatMap((group) => group.items.map((item) => item.to))).toEqual([
        '/documents', '/profile', '/sessions', '/notification-preferences',
      ])
  })
})

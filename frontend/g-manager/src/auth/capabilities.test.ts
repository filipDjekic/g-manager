/// <reference types="node" />
import type { Permission } from '../types/auth.types'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { roleCapabilities, hasCapability } from './capabilities'
import { authUser } from '../test/fixtures'

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
  '../../../../gm/src/main/java/com/game_manager/gm/common/security/RolePermissions.java'), 'utf8')

describe('frontend / backend role permission contract', () => {
  const permissions = (value: string) => [...value.matchAll(/Permission\.([A-Z_]+)/g)].map(match => match[1])
  const profile = permissions(source.match(/PROFILE = EnumSet\.of\(([\s\S]*?)\);/)![1])

  for (const role of ['CUSTOMER', 'EMPLOYEE', 'ADMIN', 'OWNER'] as const) {
    it(`matches the backend defaults for ${role}`, () => {
      const configured = source.match(new RegExp(`permissions\\.put\\(Role\\.${role}, immutableWithProfile\\(([\\s\\S]*?)\\)\\);`))![1]
      expect([...roleCapabilities[role]].sort()).toEqual([...new Set([...profile, ...permissions(configured)])].sort())
    })
  }
  it('retains explicit permission restrictions instead of granting the whole role', () => {
    expect(hasCapability(authUser('EMPLOYEE', { permissions: ['PROFILE_READ'] }), 'RESERVATION_CREATE')).toBe(false)
  })
})

describe('capability model', () => {
  it('keeps the complete role capability matrix explicit', () => {
    expect(roleCapabilities.CUSTOMER).toContain('ORDER_READ_OWN')
    expect(roleCapabilities.CUSTOMER).toContain('RESOURCE_READ')
    expect(roleCapabilities.CUSTOMER).not.toContain('ORDER_READ_ALL')
    expect(roleCapabilities.EMPLOYEE).toContain('ORDER_READ_ALL')
    expect(roleCapabilities.EMPLOYEE).toContain('CUSTOMER_CREATE')
    expect(roleCapabilities.EMPLOYEE).toContain('STATION_READ')
    expect(roleCapabilities.EMPLOYEE).toContain('GAMING_SESSION_START')
    expect(roleCapabilities.EMPLOYEE).not.toContain('APPLICATION_PROFILE_MANAGE')
    expect(roleCapabilities.EMPLOYEE).not.toContain('USER_LIST')
    expect(roleCapabilities.ADMIN).toContain('USER_LIST')
    expect(roleCapabilities.ADMIN).toContain('RESOURCE_MANAGE')
    expect(roleCapabilities.ADMIN).toContain('APPLICATION_PROFILE_MANAGE')
    expect(roleCapabilities.ADMIN).toContain('MACHINE_IDENTITY_MANAGE')
    expect(roleCapabilities.EMPLOYEE).not.toContain('MACHINE_IDENTITY_MANAGE')
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

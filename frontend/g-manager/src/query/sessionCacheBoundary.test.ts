import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { installSessionCacheBoundary } from './sessionCacheBoundary'

describe('session cache boundary', () => {
  it('discards the previous actor grants on account change, permission change and logout', () => {
    const client = new QueryClient(), stop = installSessionCacheBoundary(client)
    try {
      useAuthStore.setState({ user: authUser('OWNER') })
      client.setQueryData(['resource-management-scope'], { allResources: true })
      useAuthStore.setState({ user: authUser('EMPLOYEE') })
      expect(client.getQueryData(['resource-management-scope'])).toBeUndefined()
      client.setQueryData(['resource-management-scope'], { resourceIds: ['pc-1'] })
      useAuthStore.setState({ user: authUser('EMPLOYEE', { permissions: ['PROFILE_READ'] }) })
      expect(client.getQueryCache().getAll()).toHaveLength(0)
      client.setQueryData(['private'], 'customer information')
      useAuthStore.setState({ user: null })
      expect(client.getQueryCache().getAll()).toHaveLength(0)
    } finally { stop(); client.clear() }
  })

  it('retains data when only the token or display name changes', () => {
    const client = new QueryClient(), actor = authUser('CUSTOMER')
    useAuthStore.setState({ user: actor })
    const stop = installSessionCacheBoundary(client)
    try {
      client.setQueryData(['mine'], ['reservation-1'])
      useAuthStore.setState({ user: { ...actor, name: 'New name' }, accessToken: 'refreshed' })
      expect(client.getQueryData(['mine'])).toEqual(['reservation-1'])
    } finally { stop(); client.clear() }
  })
})

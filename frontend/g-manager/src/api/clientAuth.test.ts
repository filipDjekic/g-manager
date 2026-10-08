import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { apiClient, publicClient, refreshAccessToken } from './client'

describe('API authentication failures', () => {
  const originalAdapter = apiClient.defaults.adapter
  const user = { id: 'auth-test', name: 'Auth', email: 'auth@example.test', role: 'CUSTOMER' as const, active: true }
  beforeEach(() => { useAuthStore.setState({ accessToken: 'old-token', user }) })
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter
    vi.restoreAllMocks()
  })
  const failure = (status: number, config?: InternalAxiosRequestConfig) =>
    new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined,
      { status, statusText: 'Failure', data: {}, headers: {}, config: config ?? {} as InternalAxiosRequestConfig })

  it('preserves the session when refresh has a network failure', async () => {
    vi.spyOn(publicClient, 'post').mockRejectedValue(new AxiosError('Offline', 'ERR_NETWORK'))
    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(useAuthStore.getState().accessToken).toBe('old-token')
  })

  it('clears the session when the refresh credential is rejected', async () => {
    vi.spyOn(publicClient, 'post').mockRejectedValue(failure(401))
    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('does not clear a session when a 401 refresh attempt fails due to the network', async () => {
    vi.spyOn(publicClient, 'post').mockRejectedValue(new AxiosError('Offline', 'ERR_NETWORK'))
    apiClient.defaults.adapter = async (config) => { throw failure(401, config) }
    await expect(apiClient.get('/notifications')).rejects.toMatchObject({ response: { status: 401 } })
    expect(useAuthStore.getState().accessToken).toBe('old-token')
  })

  it('retries 401 once and clears a session when its replacement token is also rejected', async () => {
    const refresh = vi.spyOn(publicClient, 'post').mockResolvedValue({ data: { token: 'new-token', user } })
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => { throw failure(401, config) })
    apiClient.defaults.adapter = adapter
    await expect(apiClient.get('/notifications')).rejects.toMatchObject({ response: { status: 401 } })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(adapter).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('returns 403 without refreshing or clearing authentication', async () => {
    const refresh = vi.spyOn(publicClient, 'post')
    apiClient.defaults.adapter = async (config) => { throw failure(403, config) }
    await expect(apiClient.get('/notifications')).rejects.toMatchObject({ response: { status: 403 } })
    expect(refresh).not.toHaveBeenCalled()
    expect(useAuthStore.getState().accessToken).toBe('old-token')
  })
})
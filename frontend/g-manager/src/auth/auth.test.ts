import { beforeEach, describe, expect, it } from 'vitest'
import { activationSchema, loginSchema } from './schemas'
import { useAuthStore } from './authStore'

describe('auth contracts', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isInitializing: true })
  })

  it('keeps the access token only in the in-memory store', () => {
    const user = {
      id: 'user-id',
      name: 'Customer',
      email: 'customer@example.com',
      role: 'CUSTOMER' as const,
      active: true,
    }
    useAuthStore.getState().setSession('access-token', user)
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'access-token', user, isInitializing: false })
  })

  it('matches backend login and activation validation boundaries', () => {
    expect(loginSchema.safeParse({ email: 'bad', password: 'short' }).success).toBe(false)
    expect(activationSchema.safeParse({ activationSecret: '', password: 'short' }).success).toBe(false)
    expect(activationSchema.safeParse({
      activationSecret: 'one-time-activation-secret',
      password: 'StrongPass1!',
    }).success).toBe(true)
  })
})

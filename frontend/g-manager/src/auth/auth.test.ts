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
      email: 'customer@example.test',
      activationSecret: 'A7K2',
      password: 'StrongPass1!',
    }).success).toBe(true)
  })

  it('requires an email and exactly four ASCII letters or digits, and normalizes lowercase', () => {
    const request = { email: 'customer@example.test', activationSecret: 'a7k2', password: 'StrongPass1!' }
    expect(activationSchema.parse(request).activationSecret).toBe('A7K2')
    for (const code of ['', 'A7K', 'A7K22', 'A-K2', 'А7K2', 'ßß', ' A7K2']) {
      expect(activationSchema.safeParse({ ...request, activationSecret: code }).success).toBe(false)
    }
    expect(activationSchema.safeParse({ ...request, email: '' }).success).toBe(false)
    expect(activationSchema.safeParse({ ...request, password: 'x'.repeat(101) }).success).toBe(false)
  })
})

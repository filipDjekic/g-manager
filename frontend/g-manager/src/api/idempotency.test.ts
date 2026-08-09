import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { IdempotencyKeyManager } from './idempotency'

describe('IdempotencyKeyManager', () => {
  it('retains one key through network failure and clears it after success', () => {
    const keys = ['first', 'second']
    const manager = new IdempotencyKeyManager(() => keys.shift()!)
    expect(manager.begin()).toBe('first')
    manager.failed(new AxiosError('network'))
    expect(manager.begin()).toBe('first')
    manager.succeeded()
    expect(manager.begin()).toBe('second')
  })

  it('retains 425 but clears a definitive conflict', () => {
    const manager = new IdempotencyKeyManager(() => 'stable')
    manager.begin()
    manager.failed(new AxiosError('early', undefined, undefined, undefined, { status: 425 } as never))
    expect(manager.pendingKey()).toBe('stable')
    manager.failed(new AxiosError('conflict', undefined, undefined, undefined, { status: 409 } as never))
    expect(manager.pendingKey()).toBeNull()
  })
})

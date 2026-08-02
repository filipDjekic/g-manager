import { describe, expect, it } from 'vitest'
import { businessLocalToInstant } from './dateTime'

describe('businessLocalToInstant', () => {
  it('uses Europe/Belgrade summer and winter offsets', () => {
    expect(businessLocalToInstant('2026-07-15T12:00')).toBe('2026-07-15T10:00:00.000Z')
    expect(businessLocalToInstant('2026-12-15T12:00')).toBe('2026-12-15T11:00:00.000Z')
  })
})

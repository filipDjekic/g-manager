import { describe, expect, it } from 'vitest'
import { businessDate, currentBusinessMonth } from './dateRange'

describe('dashboard business date range', () => {
  it('uses Europe/Belgrade rather than the runtime local zone', () => {
    const instant = new Date('2026-01-31T23:30:00.000Z')
    expect(businessDate(instant)).toBe('2026-02-01')
    expect(currentBusinessMonth(instant)).toEqual({
      from: '2026-02-01',
      to: '2026-02-01',
    })
  })
})

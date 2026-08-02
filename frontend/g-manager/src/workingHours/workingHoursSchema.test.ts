import { describe, expect, it } from 'vitest'
import { workingHoursExceptionSchema } from './workingHoursSchema'

describe('workingHoursExceptionSchema', () => {
  it('accepts a full day closure without override times', () => {
    expect(workingHoursExceptionSchema.safeParse({
      date: '2030-12-25',
      fullDayClosed: true,
    }).success).toBe(true)
  })

  it('requires a complete, non-empty override interval', () => {
    expect(workingHoursExceptionSchema.safeParse({
      date: '2030-12-24',
      fullDayClosed: false,
      overrideOpenTime: '10:00',
    }).success).toBe(false)
    expect(workingHoursExceptionSchema.safeParse({
      date: '2030-12-24',
      fullDayClosed: false,
      overrideOpenTime: '10:00',
      overrideCloseTime: '10:00',
    }).success).toBe(false)
    expect(workingHoursExceptionSchema.safeParse({
      date: '2030-12-24',
      fullDayClosed: false,
      overrideOpenTime: '20:00',
      overrideCloseTime: '02:00',
    }).success).toBe(true)
  })
})

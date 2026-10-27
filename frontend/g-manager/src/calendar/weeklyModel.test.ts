import { describe, expect, it } from 'vitest'
import type { CalendarReservation } from '../types/reservation.types'
import { weeklyAxis, weeklyEvents, weeklyPosition } from './weeklyModel'

const event = (id: string, startTime: string, endTime: string) => ({ id, startTime, endTime } as CalendarReservation)

describe('business weekly timeline', () => {
  it('keeps both autumn 02:30 instants distinct and aligns other days by wall clock', () => {
    const model = weeklyAxis(['2026-10-24', '2026-10-25'])
    const slots = model.daySlots.get('2026-10-25')!
    expect(slots).toHaveLength(100)
    expect(model.daySlots.get('2026-10-24')).toHaveLength(96)
    const first = weeklyPosition(Date.parse('2026-10-25T00:30:00Z'), slots, model.indexes, model.rows.length)
    const second = weeklyPosition(Date.parse('2026-10-25T01:30:00Z'), slots, model.indexes, model.rows.length)
    expect(second - first).toBe(4)
    expect(model.indexes.get('03:00:0')).toBe(16)
  })

  it('represents the spring gap without creating nonexistent booking slots', () => {
    const model = weeklyAxis(['2026-03-29'])
    expect(model.daySlots.get('2026-03-29')).toHaveLength(92)
    expect(model.rows).toHaveLength(96)
    expect(model.daySlots.get('2026-03-29')!.some(slot => slot.label.startsWith('02:'))).toBe(false)
    expect(weeklyPosition(Date.parse('2026-03-29T01:00:00Z'), model.daySlots.get('2026-03-29')!, model.indexes, 96)).toBe(12)
  })

  it('clips overnight events and sizes independent overlap groups separately', () => {
    const events = [event('overnight', '2026-10-23T21:00:00Z', '2026-10-24T01:00:00Z'),
      event('a', '2026-10-24T09:00:00Z', '2026-10-24T11:00:00Z'),
      event('b', '2026-10-24T10:00:00Z', '2026-10-24T12:00:00Z'),
      event('c', '2026-10-24T15:00:00Z', '2026-10-24T16:00:00Z')]
    const from = Date.parse('2026-10-23T22:00:00Z'), to = Date.parse('2026-10-24T22:00:00Z')
    const result = weeklyEvents(events, from, to)
    expect(result[0].start).toBe(from)
    expect(result.map(item => item.columns)).toEqual([1, 2, 2, 1])
    expect(result[1].lane).not.toBe(result[2].lane)
  })
})

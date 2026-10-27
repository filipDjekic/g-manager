import { businessInstantToLocal, businessLocalToInstant } from '../reservations/dateTime'
import type { CalendarReservation } from '../types/reservation.types'
import { addDays } from './calendarModel'

export const quarterHour = 15 * 60 * 1000
export type WeekSlot = { key: string; label: string; occurrence: number; instant: number }
export type WeekEvent = { item: CalendarReservation; start: number; end: number; lane: number; columns: number }

/** Wall-clock rows are shared by every day. DST gaps are empty and repeated hours have separate rows. */
export function weeklyAxis(days: string[]) {
  const daySlots = new Map<string, WeekSlot[]>()
  const rows = new Map<string, Omit<WeekSlot, 'instant'>>()
  for (let minute = 0; minute < 1440; minute += 15) {
    const label = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
    rows.set(`${label}:0`, { key: `${label}:0`, label, occurrence: 0 })
  }
  for (const day of days) {
    const from = Date.parse(businessLocalToInstant(`${day}T00:00`))
    const to = Date.parse(businessLocalToInstant(`${addDays(day, 1)}T00:00`))
    const seen = new Map<string, number>(), slots: WeekSlot[] = []
    for (let instant = from; instant < to; instant += quarterHour) {
      const label = businessInstantToLocal(new Date(instant).toISOString()).slice(11)
      const occurrence = seen.get(label) ?? 0
      seen.set(label, occurrence + 1)
      const slot = { key: `${label}:${occurrence}`, label, occurrence, instant }
      slots.push(slot); rows.set(slot.key, slot)
    }
    daySlots.set(day, slots)
  }
  const axis = [...rows.values()].sort((a, b) => a.label.slice(0, 2).localeCompare(b.label.slice(0, 2))
    || a.occurrence - b.occurrence || a.label.localeCompare(b.label))
  const indexes = new Map(axis.map((slot, index) => [slot.key, index]))
  return { rows: axis, daySlots, indexes }
}

export function weeklyPosition(instant: number, slots: WeekSlot[], indexes: Map<string, number>, rowCount: number) {
  if (instant <= slots[0].instant) return 0
  const last = slots.at(-1)!
  if (instant >= last.instant + quarterHour) return rowCount
  const slot = slots.find(value => value.instant <= instant && instant < value.instant + quarterHour)!
  return indexes.get(slot.key)! + (instant - slot.instant) / quarterHour
}

/** Width belongs to an overlapping connected group, rather than the busiest point of the entire day. */
export function weeklyEvents(events: CalendarReservation[], from: number, to: number): WeekEvent[] {
  const sorted = events.filter(item => Date.parse(item.startTime) < to && Date.parse(item.endTime) > from)
    .map(item => ({ item, start: Math.max(from, Date.parse(item.startTime)), end: Math.min(to, Date.parse(item.endTime)), lane: 0, columns: 1 }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.item.id.localeCompare(b.item.id))
  let group: WeekEvent[] = [], ends: number[] = [], groupEnd = -Infinity
  const finish = () => { group.forEach(event => { event.columns = ends.length }) }
  for (const event of sorted) {
    if (event.start >= groupEnd) { finish(); group = []; ends = []; groupEnd = -Infinity }
    let lane = ends.findIndex(end => end <= event.start)
    if (lane < 0) lane = ends.length
    ends[lane] = event.end; event.lane = lane
    group.push(event); groupEnd = Math.max(groupEnd, event.end)
  }
  finish()
  return sorted
}

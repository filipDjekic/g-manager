import { businessInstantToLocal, businessLocalToInstant, formatBusinessDateTime, formatBusinessTime } from '../reservations/dateTime'
import type { CalendarReservation } from '../types/reservation.types'

export type CalendarView = 'day' | 'week' | 'month' | 'list'
export const calendarViews: Record<CalendarView, string> = {day: 'Dan', week: 'Nedelja', month: 'Mesec', list: 'Lista'}
export const weekdays = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned']
export const parseDate = (value: string) => new Date(`${value}T12:00:00Z`)
export const isoDate = (value: Date) => value.toISOString().slice(0, 10)
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parseDate(value).getTime()) && isoDate(parseDate(value)) === value
}
export function addDays(value: string, count: number) {
  const date = parseDate(value); date.setUTCDate(date.getUTCDate() + count); return isoDate(date)
}
export function addMonths(value: string, count: number) {
  const date = parseDate(value), day = date.getUTCDate()
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + count)
  date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()))
  return isoDate(date)
}
export function startOfWeek(value: string) { return addDays(value, -((parseDate(value).getUTCDay() + 6) % 7)) }
export function monthDays(value: string) {
  const from = startOfWeek(`${value.slice(0,7)}-01`)
  return Array.from({length: 42}, (_,index) => addDays(from,index))
}
export function rangeFor(view: CalendarView, anchor: string) {
  const days = view === 'day' ? [anchor] : view === 'month' ? monthDays(anchor)
    : Array.from({length: 7}, (_,index) => addDays(startOfWeek(anchor),index))
  return {from: days[0], to: days[days.length - 1], days}
}
export function dateLabel(value: string, full = false) {
  return new Intl.DateTimeFormat('sr-Latn-RS', {timeZone: 'UTC', weekday: full ? 'long' : 'short', day: 'numeric', month: full ? 'long' : 'short'})
    .format(parseDate(value))
}
export function monthLabel(value: string) {
  return new Intl.DateTimeFormat('sr-Latn-RS', {timeZone: 'UTC',month: 'long',year: 'numeric'}).format(parseDate(value))
}
export const instantLabel = (value: string) => formatBusinessDateTime(value,false,'sr-Latn-RS')
export function eventTime(item: {startTime: string; endTime: string}, compact = false) {
  const start = instantLabel(item.startTime), end = instantLabel(item.endTime)
  const sameDate = businessInstantToLocal(item.startTime).slice(0,10) === businessInstantToLocal(item.endTime).slice(0,10)
  return `${compact && sameDate ? formatBusinessTime(item.startTime) : start}–${sameDate ? formatBusinessTime(item.endTime) : end}`
}
export function eventsByDay(events: CalendarReservation[], days: string[]) {
  const result: Record<string,CalendarReservation[]> = {}
  const boundaries = days.map(day => ({day,from: Date.parse(businessLocalToInstant(`${day}T00:00`)),to: Date.parse(businessLocalToInstant(`${addDays(day,1)}T00:00`))}))
  for (const item of events) {
    const from = Date.parse(item.startTime), to = Date.parse(item.endTime)
    for (const boundary of boundaries) if (from < boundary.to && to > boundary.from) (result[boundary.day] ??= []).push(item)
  }
  return result
}

import { isAxiosError } from 'axios'
import { useEffect, useState } from 'react'

import { apiErrorMessage } from '../api/client'
import { userApi } from '../api/userApi'
import { type StatusTone } from '../components/ui'
import { formatBusinessDateTime, businessLocalToInstant, todayInBusinessZone } from '../reservations/dateTime'
import type { ApiError } from '../types/api.types'
import type { UserResponse } from '../types/user.types'
import type { DayOfWeek, WorkingHours, WorkingHoursException } from '../types/workingHours.types'
import type { TimeOffStatus } from '../types/timeOff.types'
export const days: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
export const dayLabels: Record<DayOfWeek, string> = { MONDAY: 'Ponedeljak', TUESDAY: 'Utorak', WEDNESDAY: 'Sreda', THURSDAY: 'Četvrtak', FRIDAY: 'Petak', SATURDAY: 'Subota', SUNDAY: 'Nedelja' }
export const timeOffLabels: Record<TimeOffStatus, string> = { PENDING: 'Na čekanju', APPROVED: 'Odobreno', REJECTED: 'Odbijeno', CANCELLED: 'Otkazano' }
export const timeOffTones: Record<TimeOffStatus, StatusTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' }
export const settingsDateTime = (value: string) => formatBusinessDateTime(value, false, 'sr-Latn-RS')
export const settingsDate = (value: string) => new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: 'UTC', dateStyle: 'long' }).format(new Date(value + 'T12:00:00Z'))
export function addCalendarDays(value: string, count: number) {
  const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}
export function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + 'T12:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
export const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
export function intervalMinutes(open: string, close: string) {
  if (!validTime(open.slice(0, 5)) || !validTime(close.slice(0, 5))) return null
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  const difference = minutes(close) - minutes(open)
  return difference < 0 ? difference + 1440 : difference
}
export function exceptionPresentation(item: WorkingHoursException, hours?: WorkingHours[]) {
  if (item.fullDayClosed) return { label: 'Ceo dan zatvoreno', tone: 'danger' as const, kind: 'closed' }
  const day = days[(new Date(item.date + 'T12:00:00Z').getUTCDay() + 6) % 7]
  const standard = hours?.find(value => value.dayOfWeek === day)
  const duration = intervalMinutes(item.overrideOpenTime ?? '', item.overrideCloseTime ?? '')
  const regular = standard?.active ? intervalMinutes(standard.openTime, standard.closeTime) : null
  if (!item.locationId && hours && duration !== null && regular !== null) {
    if (duration < regular) return { label: 'Skraćeno radno vreme', tone: 'warning' as const, kind: 'shorter' }
    if (duration > regular) return { label: 'Produženo radno vreme', tone: 'info' as const, kind: 'extended' }
  }
  return { label: 'Posebno radno vreme', tone: 'accent' as const, kind: 'custom' }
}
export function elapsedTime(start: string, end: string) {
  const minutes = Math.floor((Date.parse(end) - Date.parse(start)) / 60000)
  return minutes >= 0 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ' ' + minutes % 60 + ' min' : ''}` : '—'
}
export function settingsError(cause: unknown, fallback: string) {
  if (cause instanceof Error && !isAxiosError(cause)) return cause.message
  const payload = isAxiosError<ApiError>(cause) ? cause.response?.data : undefined
  const translated: Record<string, string> = {
    'Resource was changed; refresh and try again': 'Podaci su promenjeni u međuvremenu. Osvežite ih i ponovo unesite izmene.',
    'Working hours cannot have zero duration': 'Vreme otvaranja i zatvaranja ne sme biti identično.',
    'Exception date must be in the future': 'Datum izuzetka mora biti posle današnjeg datuma u zoni Europe/Belgrade.',
    'An exception already exists for this date': 'Za ovaj datum već postoji izuzetak.',
    'Working hours exception not found': 'Izuzetak više nije dostupan. Osvežite pregled.',
    'Closed days cannot define override hours': 'Zatvoren dan ne može imati posebno radno vreme.',
    'Both override times are required': 'Unesite vreme otvaranja i zatvaranja.',
    'Working hours management is not permitted': 'Nemate dozvolu za upravljanje podešavanjima.',
    'Employee not found': 'Izabrani zaposleni nije dostupan.',
    'Selected user is not an active employee': 'Izaberite aktivnog zaposlenog.',
    'Time-off end must be after start': 'Kraj odsustva mora biti posle početka.',
    'Employee time off overlaps an existing request': 'Odsustvo se preklapa sa postojećim zahtevom ovog zaposlenog.',
    'Past time off cannot be approved': 'Odsustvo koje je završeno ne može biti odobreno.',
    'Time-off transition is not allowed': 'Status je promenjen ili ova akcija više nije dozvoljena.',
    'Unsupported time-off transition': 'Izabrana promena statusa nije dozvoljena.',
    'Time off not found': 'Odsustvo više nije dostupno. Osvežite pregled.',
  }
  const text = payload?.message ? translated[payload.message] : undefined
  return text ? text + (payload?.requestId ? ` (ID zahteva: ${payload.requestId})` : '') : apiErrorMessage(cause, fallback)
}
export async function settingsEmployees(management: boolean) {
  const result = new Map<string, UserResponse>()
  let page = 0, total: number
  do {
    const response = management ? await userApi.list({ page, size: 100, role: 'EMPLOYEE', sort: 'name', direction: 'ASC' }) : await userApi.employeesPage(page, 100)
    response.content.forEach(item => result.set(item.id, item)); total = response.totalPages; page++
  } while (page < total)
  return [...result.values()]
}
export function useBusinessToday() {
  const [today, setToday] = useState(() => todayInBusinessZone())
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayInBusinessZone()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  return today
}
export function businessDayBounds(from: string, to: string) {
  return { from: from ? businessLocalToInstant(from + 'T00:00') : '', to: to ? businessLocalToInstant(addCalendarDays(to, 1) + 'T00:00') : '' }
}
export type SettingsIconKind = 'settings' | 'building' | 'layers' | 'monitor' | 'users' | 'clock' | 'calendar' | 'gamepad' | 'package' | 'client' | 'plus' | 'refresh' | 'chevron-left' | 'chevron-right' | 'edit' | 'trash' | 'info' | 'check' | 'close'
export function restoreSettingsFocus(target: HTMLElement | null) {
  window.requestAnimationFrame(() => {
    const available = target?.isConnected && target.getClientRects().length > 0 && !target.closest('[hidden],[inert]')
    const fallback = document.querySelector<HTMLButtonElement>('.gm-settings-tabs [role="tab"][aria-selected="true"]')
    const destination = available ? target : fallback
    destination?.focus({ preventScroll: true })
  })
}

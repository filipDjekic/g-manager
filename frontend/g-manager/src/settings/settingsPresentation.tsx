import { isAxiosError } from 'axios'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { apiErrorMessage } from '../api/client'
import { userApi } from '../api/userApi'
import { Button, type StatusTone } from '../components/ui'
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
  let page = 0, total = 1
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
export function SettingsIcon({ kind = 'settings' }: { kind?: SettingsIconKind }) {
  const paths: Record<SettingsIconKind, ReactNode> = {
    settings: <><path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 3h3l1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-3H9Z" /><circle cx="12" cy="12" r="3" /></>,
    building: <><path d="M4 21V3h12v18M16 9h4v12M2 21h20M8 7h4M8 11h4M8 15h4" /></>,
    layers: <><path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
    monitor: <><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M12 16v5m-5 0h10" /></>,
    users: <><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6m3 3a6 6 0 0 1 3 5v3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-12 4h2m3 0h2" /></>,
    gamepad: <><path d="M7 7h10c4 0 6 12 3 13-2 1-5-3-5-3H9s-3 4-5 3C1 19 3 7 7 7Z" /><path d="M7 10v5m-2-2h4m6-1h.01m3 2h.01" /></>,
    package: <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9v10M3 8l9 4 9-4M8 5l9 5" /></>,
    client: <><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M8 21h8m-4-4v4m-5-11 3 3 6-6" /></>,
    plus: <path d="M12 5v14M5 12h14" />, refresh: <path d="M3 10a9 9 0 1 1 1 9M3 4v6h6" />,
    'chevron-left': <path d="m15 5-7 7 7 7" />, 'chevron-right': <path d="m9 5 7 7-7 7" />,
    edit: <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z" />,
    trash: <path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
    check: <path d="m5 12 4 4 10-11" />, close: <path d="m6 6 12 12M6 18 18 6" />,
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[kind]}</svg>
}
export function SettingsSwitch({ label, ariaLabel, checked, disabled, onChange }: { label: string; ariaLabel?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className="gm-settings-switch"><input type="checkbox" role="switch" aria-label={ariaLabel ?? label} checked={checked} disabled={disabled}
    onChange={event => onChange(event.target.checked)} /><span className="gm-settings-switch-track" aria-hidden="true" /><span>{label}</span></label>
}
export function SettingsAvatar({ name }: { name: string }) {
  return <span className="gm-settings-avatar" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('sr-Latn-RS') || '?'}</span>
}
export function restoreSettingsFocus(target: HTMLElement | null) {
  window.requestAnimationFrame(() => {
    const available = target?.isConnected && target.getClientRects().length > 0 && !target.closest('[hidden],[inert]')
    const fallback = document.querySelector<HTMLButtonElement>('.gm-settings-tabs [role="tab"][aria-selected="true"]')
    const destination = available ? target : fallback
    destination?.focus({ preventScroll: true })
  })
}
export function SettingsActionMenu({ label, actions, disabled }: { label: string; actions: Array<{ label: string; icon?: SettingsIconKind; danger?: boolean; onClick: (opener: HTMLButtonElement | null) => void }>; disabled?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), id = useId()
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 300 })
  useLayoutEffect(() => {
    if (!open) return
    const locate = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return
      const height = Math.min(menu.current?.scrollHeight ?? 240, window.innerHeight - 24)
      setPosition({ left: Math.max(12, Math.min(rect.right - 228, window.innerWidth - 240)),
        top: window.innerHeight - rect.bottom >= height + 12 ? rect.bottom + 6 : Math.max(12, rect.top - height - 6), maxHeight: height })
    }
    locate(); window.addEventListener('resize', locate)
    return () => window.removeEventListener('resize', locate)
  }, [open])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false) }
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside); window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', scroll, true) }
  }, [open])
  return <><Button ref={trigger} type="button" variant="secondary" className="gm-settings-menu-trigger" aria-label={label} disabled={disabled}
    aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>⋯</Button>
    {open && createPortal(<div id={id} ref={menu} role="menu" className="gm-settings-menu" aria-label={label} style={position} onKeyDown={event => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []), index = items.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() }
      if (event.key === 'Tab') { setOpen(false); trigger.current?.focus() }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      }
    }}>{actions.map(action => <button key={action.label} type="button" role="menuitem" className={action.danger ? 'is-danger' : ''}
      onClick={() => { setOpen(false); trigger.current?.focus(); action.onClick(trigger.current) }}>{action.icon && <SettingsIcon kind={action.icon} />}{action.label}</button>)}</div>, document.body)}
  </>
}

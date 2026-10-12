import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { isAxiosError } from 'axios'
import { Link } from 'react-router-dom'
import { apiClient, apiErrorMessage } from '../api/client'
import { catalogApi } from '../api/catalogApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, type StatusTone } from '../components/ui'
import { dateInBusinessZone, formatBusinessDateTime } from '../reservations/dateTime'
import type { CatalogItem } from '../types/catalog.types'
import type { UserResponse } from '../types/user.types'
import type { ApiError, PageResponse } from '../types/api.types'
import type { WaitlistOperationalEntry, WaitlistStatus } from '../types/waitlist.types'

export const waitlistLabels: Record<WaitlistStatus, string> = {
  WAITING: 'Čeka termin', OFFERED: 'Ponuda poslata', ACCEPTED: 'Prihvaćeno', CANCELLED: 'Otkazano',
}
const tones: Record<WaitlistStatus, StatusTone> = { WAITING: 'warning', OFFERED: 'info', ACCEPTED: 'success', CANCELLED: 'neutral' }
export const waitlistDate = (value: string) => formatBusinessDateTime(value, false, 'sr-Latn-RS')
export const resourceLabels: Record<string, string> = { GAMING_PC: 'Gaming računar', PLAYSTATION: 'PlayStation', SIMULATOR: 'Simulator', VIP_ROOM: 'VIP soba', OTHER: 'Drugi resurs' }
export function WaitlistIcon({ kind = 'list' }: { kind?: 'list' | 'clock' | 'offer' | 'check' | 'cancel' | 'search' | 'edit' | 'calendar' | 'customer' | 'refresh' | 'close' | 'plus' }) {
  const paths: Record<typeof kind, ReactNode> = {
    list: <><path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2M9 6h12M9 12h12M9 18h12" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    offer: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 7 9 6 9-6" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    cancel: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
    edit: <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
    customer: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    refresh: <path d="M3 10a9 9 0 1 1 1 9M3 4v6h6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />, plus: <path d="M12 5v14M5 12h14" />,
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[kind]}</svg>
}
export function WaitlistAvatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('sr-Latn-RS')
  return <span className="gm-waitlist-avatar" aria-hidden="true">{initials || '?'}</span>
}
export function WaitlistStatusBadge({ entry, now }: { entry: WaitlistOperationalEntry; now: number }) {
  const expired = entry.offerStatus === 'EXPIRED' || Boolean(entry.offerExpiresAt && Date.parse(entry.offerExpiresAt) <= now)
  return <div className="gm-waitlist-status"><Badge tone={tones[entry.status]}>{waitlistLabels[entry.status]}</Badge>
    {entry.status === 'WAITING' && expired && <small>Ponuda istekla — ponovo čeka termin.</small>}
    {entry.status === 'OFFERED' && expired && <small>Rok ponude je istekao. Čeka se automatska provera.</small>}
  </div>
}
export function waitlistCalendar(entry: WaitlistOperationalEntry) {
  return '/calendar?' + new URLSearchParams({ employeeId: entry.employeeId, date: dateInBusinessZone(entry.desiredStart), view: 'day',
    ...(entry.resourceId ? { resourceId: entry.resourceId } : {}), ...(entry.locationId ? { locationId: entry.locationId } : {}) })
}
export function waitlistError(cause: unknown, fallback = 'Prijavu nije moguće sačuvati.') {
  if (cause instanceof Error && !isAxiosError(cause)) return cause.message
  const payload = isAxiosError<ApiError>(cause) ? cause.response?.data : undefined
  const message = payload?.message ?? apiErrorMessage(cause, fallback)
  const requestId = payload?.requestId ? ` (ID zahteva: ${payload.requestId})` : ''
  const translations: Record<string, string> = {
    'Slot is available and can be reserved directly': 'Izabrani termin je slobodan. Možete napraviti direktnu rezervaciju.',
    'An active waitlist entry already exists': 'Klijent već ima aktivnu prijavu za ovaj termin.',
    'Waitlist entry not found': 'Prijava nije pronađena ili više nije u vašem opsegu.',
    'Customer is not available for booking': 'Izaberite aktivan nalog klijenta.',
    'Selected user is not an active employee': 'Izabrani zaposleni nije aktivan.',
    'Waitlist time must be in the future': 'Željeni termin mora biti u budućnosti.',
    'Waitlist management is outside your assigned scope': 'Prijava je van vašeg dodeljenog opsega.',
    'Station management is not permitted': 'Nemate pristup izabranom resursu.',
    'Resource does not support the selected service': 'Resurs ne podržava izabranu uslugu.',
    'Resource does not belong to the selected location': 'Resurs ne pripada izabranom lokalu.',
    'Resource does not belong to the selected area': 'Resurs ne pripada izabranoj zoni.',
    'Area does not belong to the selected location': 'Zona ne pripada izabranom lokalu.',
    'Reservation is outside working hours': 'Ceo termin mora biti unutar radnog vremena.',
    'Employee is on approved time off': 'Zaposleni je odsutan u izabranom terminu.',
    'No compatible bookable resource': 'Nema odgovarajućeg resursa za izabranu uslugu.',
    'Resource or location is inactive or not bookable': 'Resurs ili lokal nije aktivan ili dostupan za rezervisanje.',
    'Area is inactive': 'Izabrana zona nije aktivna.', 'Location is inactive': 'Izabrani lokal nije aktivan.',
    'Catalog item is not a service': 'Izaberite uslugu.', 'Catalog item not found': 'Usluga nije dostupna.',
  }
  if (translations[message]) return translations[message] + requestId
  if (isAxiosError(cause) && cause.response?.status === 409)
    return 'Podaci su promenjeni ili akcija više nije dozvoljena. Osvežite prijavu i pokušajte ponovo.' + requestId
  return apiErrorMessage(cause, fallback)
}
async function servicesForWaitlist(active?: boolean) {
  const items = new Map<string, CatalogItem>()
  let page = 0, pages = 1
  do {
    const result = await catalogApi.list({ page, size: 100, type: 'SERVICE', active, sort: 'name', direction: 'ASC' })
    result.content.forEach(item => items.set(item.id, item)); pages = result.totalPages; page++
  } while (page < pages)
  return [...items.values()]
}
export const waitlistServices = () => servicesForWaitlist(true)
export const waitlistFilterServices = () => servicesForWaitlist()
export async function waitlistEmployees() {
  const items = new Map<string, UserResponse>()
  let page = 0, pages = 1
  do {
    const { data } = await apiClient.get<PageResponse<UserResponse>>('/users/employees', { params: { page, size: 100 } })
    data.content.forEach(item => items.set(item.id, item)); pages = data.totalPages; page++
  } while (page < pages)
  return [...items.values()]
}
export function WaitlistMenu({ entry, disabled, onDetails, onEdit, onCancel }: {
  entry: WaitlistOperationalEntry; disabled: boolean; onDetails: (opener: HTMLButtonElement | null) => void
  onEdit: (opener: HTMLButtonElement | null) => void; onCancel: () => void
}) {
  const canManage = hasCapability(useAuthStore(state => state.user), 'WAITLIST_MANAGE')
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), id = useId()
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 300 })
  useLayoutEffect(() => {
    if (!open) return
    const locate = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return
      const height = Math.min(menu.current?.scrollHeight ?? 230, window.innerHeight - 24)
      setPosition({ left: Math.max(12, Math.min(rect.right - 228, window.innerWidth - 240)),
        top: window.innerHeight - rect.bottom >= height + 12 ? rect.bottom + 6 : Math.max(12, rect.top - height - 6), maxHeight: height })
    }
    locate(); window.addEventListener('resize', locate)
    return () => window.removeEventListener('resize', locate)
  }, [open])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false) }
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside); window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', scroll, true) }
  }, [open])
  const choose = (callback: () => void) => { setOpen(false); trigger.current?.focus(); callback() }
  return <span className="gm-waitlist-menu-wrap" onClick={event => event.stopPropagation()}>
    <Button ref={trigger} type="button" variant="secondary" className="gm-waitlist-menu-trigger" disabled={disabled} aria-label={`Akcije za ${entry.customerName}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>⋯</Button>
    {open && createPortal(<div id={id} ref={menu} style={position} className="gm-waitlist-menu" role="menu" aria-label="Akcije prijave"
      onClick={event => event.stopPropagation()} onKeyDown={event => {
        const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        const index = items.indexOf(document.activeElement as HTMLElement)
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); choose(() => undefined) }
        if (event.key === 'Tab') { setOpen(false); trigger.current?.focus() }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
        }
      }}>
      <button type="button" role="menuitem" onClick={() => choose(() => onDetails(trigger.current))}><WaitlistIcon kind="list" />Detalji</button>
      {canManage && entry.allowedActions.includes('EDIT') && <button type="button" role="menuitem" onClick={() => choose(() => onEdit(trigger.current))}><WaitlistIcon kind="edit" />Izmeni prijavu</button>}
      {canManage && entry.allowedActions.includes('CANCEL') && <button type="button" role="menuitem" className="is-danger" onClick={() => choose(onCancel)}><WaitlistIcon kind="cancel" />Otkaži prijavu</button>}
      {entry.allowedActions.includes('CALENDAR') && <Link role="menuitem" to={waitlistCalendar(entry)} onClick={() => setOpen(false)}><WaitlistIcon kind="calendar" />Proveri kalendar</Link>}
      {entry.allowedActions.includes('CUSTOMER') && <Link role="menuitem" to={`/customers?customerId=${entry.customerId}`} onClick={() => setOpen(false)}><WaitlistIcon kind="customer" />Pogledaj klijenta</Link>}
    </div>, document.body)}
  </span>
}

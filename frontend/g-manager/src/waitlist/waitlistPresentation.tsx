import { waitlistLabels, waitlistCalendar } from './waitlistPresentation.model'
import type { ReactNode } from 'react'

import { useNavigate } from 'react-router-dom'


import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { ActionMenu, type MenuAction, Badge, type StatusTone } from '../components/ui'




import type { WaitlistOperationalEntry, WaitlistStatus } from '../types/waitlist.types'
const tones: Record<WaitlistStatus, StatusTone> = { WAITING: 'warning', OFFERED: 'info', ACCEPTED: 'success', CANCELLED: 'neutral' }
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
export function WaitlistMenu({ entry, disabled, onDetails, onEdit, onCancel }: {
  entry: WaitlistOperationalEntry; disabled: boolean; onDetails: (opener: HTMLButtonElement | null) => void
  onEdit: (opener: HTMLButtonElement | null) => void; onCancel: () => void
}) {
  const canManage = hasCapability(useAuthStore(state => state.user), 'WAITLIST_MANAGE'), navigate = useNavigate()
  const actions: MenuAction[] = [{ label: 'Detalji', onClick: onDetails }]
  if (canManage && entry.allowedActions.includes('EDIT')) actions.push({ label: 'Izmeni prijavu', onClick: onEdit })
  if (canManage && entry.allowedActions.includes('CANCEL')) actions.push({ label: 'Otkaži prijavu', danger: true, onClick: onCancel })
  if (entry.allowedActions.includes('CALENDAR')) actions.push({ label: 'Proveri kalendar', onClick: () => navigate(waitlistCalendar(entry)) })
  if (entry.allowedActions.includes('CUSTOMER')) actions.push({ label: 'Pogledaj klijenta', onClick: () => navigate('/customers?customerId=' + entry.customerId) })
  return <span onClick={event => event.stopPropagation()}><ActionMenu label={'Akcije za ' + entry.customerName} disabled={disabled} actions={actions} /></span>
}



import { type StatusTone } from '../../components/ui'
import { orderLabels, orderTones, reservationLabels, reservationTones } from '../../components/ui/statusPresentation'


import type { GamingSessionVisit } from '../../types/gamingSession.types'
import type { Reservation } from '../../types/reservation.types'
import type { Order } from '../../types/order.types'
import type { WaitlistEntry } from '../../types/waitlist.types'
export type HomeIconKind = 'gamepad' | 'cart' | 'clock' | 'arrow' | 'refresh'

export function homeCountdown(seconds: number) {
  if (!Number.isFinite(seconds)) return '-'
  const value = Math.max(0, Math.ceil(seconds))
  return [Math.floor(value / 3600), Math.floor(value % 3600 / 60), value % 60].map(part => String(part).padStart(2, '0')).join(':')
}
export function sessionState(visit: GamingSessionVisit, now: number, synchronized: boolean): { label: string; tone: StatusTone } {
  if (visit.status === 'EXPIRED') return { label: 'Istekla', tone: 'warning' }
  if (visit.status === 'TERMINATED') return { label: 'Završena', tone: 'neutral' }
  return synchronized && Date.parse(visit.endsAt) <= now
    ? { label: 'Vreme isteklo', tone: 'warning' } : { label: 'Aktivna', tone: 'info' }
}
export const sessionHref = (id: string) => `/home?sessionId=${encodeURIComponent(id)}`
export const reservationHref = (id: string) => `/my-reservations?reservationId=${encodeURIComponent(id)}`
export const waitlistHref = (entry: WaitlistEntry) => entry.offerId
  ? `/my-reservations?section=waitlist&waitlistOffer=${encodeURIComponent(entry.offerId)}` : '/my-reservations?section=waitlist'
export function validOffer(entry: WaitlistEntry, now: number, synchronized: boolean) {
  return synchronized && entry.status === 'OFFERED' && (entry.offerStatus == null || entry.offerStatus === 'OFFERED')
    && Boolean(entry.offerId && entry.offerExpiresAt) && Date.parse(entry.offerExpiresAt!) > now && Date.parse(entry.desiredStart) > now
}

export interface CustomerActivity {
  key: string; title: string; detail: string; occurredAt: string; to: string; icon: string; iconKind?: HomeIconKind; sessionId?: string
  status?: { label: string; tone: StatusTone }
}
export function customerActivities(visits: GamingSessionVisit[], reservations: Reservation[], orders: Order[]): CustomerActivity[] {
  const events: CustomerActivity[] = []
  visits.forEach(visit => {
    events.push({ key: `session-start-${visit.id}`, title: 'Pokrenuta gaming sesija', detail: visit.resourceName,
      occurredAt: visit.startedAt, to: sessionHref(visit.id), icon: '/gaming-sessions', iconKind: 'gamepad', sessionId: visit.id })
    if (visit.status !== 'ACTIVE' && visit.endedAt) events.push({ key: `session-end-${visit.id}`,
      title: visit.status === 'EXPIRED' ? 'Istekla gaming sesija' : 'Završena gaming sesija', detail: visit.resourceName,
      occurredAt: visit.endedAt, to: sessionHref(visit.id), icon: '/gaming-sessions', iconKind: 'gamepad', sessionId: visit.id })
  })
  reservations.forEach(value => events.push({ key: `reservation-created-${value.id}`, title: 'Kreirana rezervacija', detail: value.serviceName || 'Rezervacija',
    occurredAt: value.createdAt, to: reservationHref(value.id), icon: '/my-reservations',
    status: { label: reservationLabels[value.status], tone: reservationTones[value.status] } }))
  orders.forEach(value => events.push({ key: `order-created-${value.id}`, title: 'Kreirana narudžbina', detail: `${value.items.length} stavki`,
    occurredAt: value.createdAt, to: '/my-orders', icon: '/my-orders', iconKind: 'cart',
    status: { label: orderLabels[value.status], tone: orderTones[value.status] } }))
  return events.filter(event => Number.isFinite(Date.parse(event.occurredAt)))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.key.localeCompare(b.key)).slice(0, 6)
}

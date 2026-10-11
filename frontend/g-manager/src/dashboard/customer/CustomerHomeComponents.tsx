import type { ReactNode, RefObject } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, EmptyState, ErrorState, Modal, Skeleton, type StatusTone } from '../../components/ui'
import { orderLabels, orderTones, reservationLabels, reservationTones } from '../../components/ui/statusPresentation'
import { DashboardMetricCard } from '../DashboardComponents'
import { formatBusinessDateTime, formatBusinessIntervalEnd } from '../../reservations/dateTime'
import type { GamingSessionVisit } from '../../types/gamingSession.types'
import type { Reservation } from '../../types/reservation.types'
import type { Order } from '../../types/order.types'
import type { WaitlistEntry } from '../../types/waitlist.types'

export type HomeIconKind = 'gamepad' | 'cart' | 'clock' | 'arrow' | 'refresh'
export function CustomerHomeIcon({ kind }: { kind: HomeIconKind }) {
  const paths: Record<HomeIconKind, string> = {
    gamepad: 'M6 7h12a3 3 0 0 1 3 2l1 7a3 3 0 0 1-5 2l-2-2H9l-2 2a3 3 0 0 1-5-2l1-7a3 3 0 0 1 3-2 M6 10v4 M4 12h4 M16 11h.01 M19 13h.01',
    cart: 'M3 3h2l3 13h11l3-9H6 M10 21h.01 M18 21h.01',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
    arrow: 'M5 12h14 M13 6l6 6-6 6',
    refresh: 'M20 8a8 8 0 1 0 .6 7 M20 3v5h-5',
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[kind]} /></svg>
}

export function GamingMotif() {
  return <svg className="gm-home-gaming-motif" viewBox="0 0 220 150" fill="none" aria-hidden="true" focusable="false">
    <g className="gm-home-motif-screen" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="26" y="18" width="144" height="91" rx="9" />
      <rect x="34" y="26" width="128" height="72" rx="3" />
      <path d="M78 110v15h40v-15 M64 126h69 M52 52h58 M52 61h33 M49 139h122" />
    </g>
    <g className="gm-home-motif-controller" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M145 92h36a10 10 0 0 1 10 8l4 24a8 8 0 0 1-14 6l-8-8h-20l-8 8a8 8 0 0 1-14-6l4-24a10 10 0 0 1 10-8Z" />
      <path d="M145 102v12 M139 108h12 M175 104h.1 M184 112h.1" />
    </g>
  </svg>
}

export function homeCountdown(seconds: number) {
  if (!Number.isFinite(seconds)) return '—'
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

export function CustomerHomeMetric({ label, value, detail, icon, iconNode, tone, to, linkLabel, error, loading, onRetry, onOpen }: {
  label: string; value: ReactNode; detail?: ReactNode; icon: string; iconNode?: ReactNode; tone?: StatusTone
  to?: string; linkLabel?: string; error?: boolean; loading: boolean; onRetry: () => void; onOpen?: (element: HTMLElement) => void
}) {
  return <DashboardMetricCard label={label} value={loading
    ? <span className="ui-skeleton gm-home-kpi-skeleton" role="status" aria-label={`Učitavanje: ${label}`}><span /><span /></span>
    : error ? '—' : value} detail={
    error ? undefined : loading ? 'Učitavanje…' : detail
  } icon={icon} iconNode={iconNode} tone={tone}>
    {error && <ErrorState message="Podaci nisu dostupni." action={<Button type="button" className="gm-home-kpi-retry" variant="secondary" onClick={onRetry}>Pokušaj ponovo</Button>} />}
    {to && <Link className="gm-home-kpi-link" to={to} onClick={event => onOpen?.(event.currentTarget)}>{linkLabel ?? 'Pogledaj detalje'}<span aria-hidden="true">↗</span></Link>}
  </DashboardMetricCard>
}

export function ActiveGamingVisit({ visit, now, synchronized, onOpen }: {
  visit: GamingSessionVisit; now: number; synchronized: boolean; onOpen: (element: HTMLElement) => void
}) {
  const status = sessionState(visit, now, synchronized)
  return <article className="gm-home-active-visit">
    <div className="gm-home-session-visual"><GamingMotif /></div>
    <div className="gm-home-session-heading"><div><span>Računar / gaming resurs</span><h3>{visit.resourceName}</h3></div><Badge tone={status.tone}>{status.label}</Badge></div>
    <div className="gm-home-session-timer"><span>Preostalo vreme</span>
      <strong role="timer" aria-label="Preostalo vreme gaming sesije">{synchronized ? homeCountdown((Date.parse(visit.endsAt) - now) / 1000) : '—'}</strong>
      {!synchronized && <small>Sinhronizacija vremena…</small>}
    </div>
    <dl className="gm-home-session-times">
      <div><dt>Početak</dt><dd><time dateTime={visit.startedAt}>{formatBusinessDateTime(visit.startedAt, false, 'sr-Latn-RS')}</time></dd></div>
      <div><dt>Planirani kraj</dt><dd><time dateTime={visit.endsAt}>{formatBusinessDateTime(visit.endsAt, false, 'sr-Latn-RS')}</time></dd></div>
    </dl>
    {synchronized && Date.parse(visit.endsAt) <= now && <p className="gm-home-notice" role="status">Vreme je isteklo. Čeka se osvežavanje statusa sesije.</p>}
    <Link className="button-link gm-home-session-link" to={sessionHref(visit.id)} onClick={event => onOpen(event.currentTarget)}>Detalji sesije<CustomerHomeIcon kind="arrow" /></Link>
    <p className="gm-home-session-help">Za produženje vremena obratite se zaposlenom.</p>
  </article>
}

export function CustomerSessionDialog({ open, visit, now, synchronized, loading, error, returnFocusRef, onClose, onRefresh }: {
  open: boolean; visit?: GamingSessionVisit; now: number; synchronized: boolean; loading: boolean; error?: string
  returnFocusRef: RefObject<HTMLElement | null>; onClose: () => void; onRefresh: () => void
}) {
  const status = visit ? sessionState(visit, now, synchronized) : undefined
  return <Modal open={open} title="Detalji gaming sesije" titleIcon={<CustomerHomeIcon kind="gamepad" />}
    className="gm-customer-session-dialog" returnFocusRef={returnFocusRef} onClose={onClose}
    footer={<div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Zatvori</Button></div>}>
    {error ? <ErrorState message={error} action={<Button type="button" onClick={onRefresh}>Pokušaj ponovo</Button>} />
      : visit && status ? <div className="gm-home-session-detail">
        <div className="gm-home-session-heading"><h3>{visit.resourceName}</h3><Badge tone={status.tone}>{status.label}</Badge></div>
        {visit.status === 'ACTIVE' && <div className="gm-home-session-timer"><span>Preostalo vreme</span><strong role="timer" aria-label="Preostalo vreme sesije">{synchronized ? homeCountdown((Date.parse(visit.endsAt) - now) / 1000) : '—'}</strong></div>}
        <dl className="gm-home-session-times">
          <div><dt>Početak</dt><dd>{formatBusinessDateTime(visit.startedAt, false, 'sr-Latn-RS')}</dd></div>
          <div><dt>Planirani kraj</dt><dd>{formatBusinessDateTime(visit.endsAt, false, 'sr-Latn-RS')}</dd></div>
          <div><dt>Planirano trajanje</dt><dd>{Math.max(0, Math.round((Date.parse(visit.endsAt) - Date.parse(visit.startedAt)) / 60000))} min</dd></div>
          {visit.endedAt && <><div><dt>Završetak sesije</dt><dd>{formatBusinessDateTime(visit.endedAt, false, 'sr-Latn-RS')}</dd></div>
            <div><dt>Trajanje</dt><dd>{Math.max(0, Math.round((Date.parse(visit.endedAt) - Date.parse(visit.startedAt)) / 60000))} min</dd></div></>}
        </dl>
        {visit.status === 'ACTIVE' && <p className="gm-home-session-help">Za produženje vremena obratite se zaposlenom.</p>}
      </div> : loading ? <Skeleton lines={5} label="Učitavanje detalja gaming sesije" />
        : <EmptyState title="Sesija nije dostupna u ovom pregledu" description="Ovde su dostupne vaše poslednje sesije i gaming istorija." />}
  </Modal>
}

export function UpcomingReservations({ reservations }: { reservations: Reservation[] }) {
  return <ul className="gm-home-upcoming-list">{reservations.map(value => <li key={value.id}>
    <Link to={reservationHref(value.id)}>
      <div className="gm-home-reservation-heading"><strong>{value.serviceName || 'Rezervacija'}<span aria-hidden="true">↗</span></strong><Badge tone={reservationTones[value.status]}>{reservationLabels[value.status]}</Badge></div>
      <time dateTime={value.startTime}>{formatBusinessDateTime(value.startTime, false, 'sr-Latn-RS')} – {formatBusinessIntervalEnd(value.startTime, value.endTime, 'sr-Latn-RS')}</time>
      <span>{value.resourceId ? [value.resourceCode, value.resourceName].filter(Boolean).join(' · ') || 'Dodeljeni resurs'
        : value.resourceRequired ? 'Resurs još nije dodeljen' : 'Usluga bez fizičkog resursa'}</span>
      {value.locationName && <small>{value.locationName}</small>}
    </Link>
  </li>)}</ul>
}

export function CustomerWaitlistPreview({ entries, now, synchronized, canManage }: {
  entries: WaitlistEntry[]; now: number; synchronized: boolean; canManage: boolean
}) {
  const sorted = [...entries].sort((a, b) => Number(validOffer(b, now, synchronized)) - Number(validOffer(a, now, synchronized)) || Date.parse(a.desiredStart) - Date.parse(b.desiredStart))
  return <ul className="gm-home-waitlist-list">{sorted.map(entry => {
    const offered = entry.status === 'OFFERED', active = validOffer(entry, now, synchronized)
    const past = synchronized && Date.parse(entry.desiredStart) <= now
    const expired = entry.offerStatus === 'EXPIRED' || past || Boolean(synchronized && entry.offerExpiresAt && Date.parse(entry.offerExpiresAt) <= now)
    return <li key={entry.id} className={active ? 'gm-home-offered' : undefined}>
      <div className="gm-home-reservation-heading"><strong>{entry.serviceName || 'Prijava na listu čekanja'}</strong>
        <Badge tone={active ? 'accent' : expired ? 'neutral' : 'warning'}>{active ? 'Ponuda čeka odgovor' : expired ? 'Ponuda nije važeća' : offered ? 'Provera ponude' : 'Čeka slobodan termin'}</Badge></div>
      {active && <p className="gm-home-offer-intro">Oslobodio se termin koji ste čekali.</p>}
      <time dateTime={entry.desiredStart}>{formatBusinessDateTime(entry.desiredStart, false, 'sr-Latn-RS')}{entry.desiredEnd && ` – ${formatBusinessIntervalEnd(entry.desiredStart, entry.desiredEnd, 'sr-Latn-RS')}`}</time>
      {(entry.resourceId || entry.locationName) && <span>{[entry.resourceCode, entry.resourceName, entry.locationName].filter(Boolean).join(' · ') || 'Dodeljeni resurs'}</span>}
      {offered && entry.offerExpiresAt && <small>Rok za prihvatanje: {formatBusinessDateTime(entry.offerExpiresAt, true, 'sr-Latn-RS')}</small>}
      {active && <strong className="gm-home-offer-timer" role="timer" aria-label="Preostalo vreme ponude">{homeCountdown((Date.parse(entry.offerExpiresAt!) - now) / 1000)}</strong>}
      {offered && !synchronized && <small>Sinhronizacija vremena ponude…</small>}
      {expired && <p className="gm-home-notice">{past ? 'Izabrani termin je prošao.' : 'Ponuda je istekla. Proverite stanje prijave na listi čekanja.'}</p>}
      <Link className={active ? 'button-link gm-home-offer-link' : 'gm-home-text-link'} to={waitlistHref(entry)}>{active ? canManage ? 'Pregledaj i prihvati termin' : 'Pregledaj ponudu' : 'Pregledaj prijavu'}<CustomerHomeIcon kind="arrow" /></Link>
      {active && canManage && <small>Prihvatanje i otkazivanje dostupni su u pregledu prijave.</small>}
    </li>
  })}</ul>
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

export function CustomerActivityList({ activities, icon, onOpen }: {
  activities: CustomerActivity[]; icon: (path: string) => ReactNode; onOpen: (element: HTMLElement) => void
}) {
  return <ol className="gm-home-activity-list">{activities.map(activity => <li key={activity.key}>
    <span className="gm-home-activity-icon">{activity.iconKind ? <CustomerHomeIcon kind={activity.iconKind} /> : icon(activity.icon)}</span>
    <div><Link to={activity.to} onClick={event => { if (activity.sessionId) onOpen(event.currentTarget) }}>{activity.title}<span aria-hidden="true">↗</span></Link>
      <p>{activity.detail}</p><time dateTime={activity.occurredAt}>{formatBusinessDateTime(activity.occurredAt, false, 'sr-Latn-RS')}</time>
      {activity.status && <div className="gm-home-activity-status"><span>Trenutni status:</span><Badge tone={activity.status.tone}>{activity.status.label}</Badge></div>}
    </div>
  </li>)}</ol>
}

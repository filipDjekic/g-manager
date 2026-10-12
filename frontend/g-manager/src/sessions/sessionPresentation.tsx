import type { ReactNode } from 'react'
import type { StatusTone } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { SecurityEventInfo, SecurityEventType, SessionInfo } from '../types/auth.types'

export type SessionIconKind = 'shield' | 'devices' | 'monitor' | 'laptop' | 'phone' | 'tablet' | 'clock' | 'alert'
  | 'refresh' | 'login' | 'logout' | 'error' | 'shieldX' | 'info'

export function SessionIcon({ kind, className = '' }: { kind: SessionIconKind; className?: string }) {
  const paths: Record<SessionIconKind, ReactNode> = {
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
    devices: <><rect x="2" y="4" width="14" height="11" rx="2" /><rect x="17" y="9" width="5" height="12" rx="1" /><path d="M6 20h6M9 15v5" /></>,
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    laptop: <><rect x="5" y="3" width="14" height="13" rx="2" /><path d="m5 16-3 5h20l-3-5" /></>,
    phone: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 5h4M12 19h.01" /></>,
    tablet: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M12 19h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM12 8v5M12 16h.01" /></>,
    refresh: <><path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5" /></>,
    login: <><path d="M14 3h6v18h-6M3 12h12m-4-4 4 4-4 4" /></>,
    logout: <><path d="M10 3H4v18h6M10 12h12m-4-4 4 4-4 4" /></>,
    error: <><circle cx="12" cy="12" r="9" /><path d="m8 8 8 8M16 8l-8 8" /></>,
    shieldX: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 9l6 6M15 9l-6 6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  }
  return <svg className={`gm-session-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[kind]}</svg>
}

export const securityEventPresentation: Record<SecurityEventType, {
  label: string; detail: string; icon: SessionIconKind; tone: StatusTone
}> = {
  LOGIN_SUCCESS: { label: 'Uspešna prijava', detail: 'Zabeležena je uspešna prijava na nalog.', icon: 'login', tone: 'success' },
  LOGIN_FAILURE: { label: 'Neuspešna prijava', detail: 'Zabeležen je neuspešan pokušaj prijave.', icon: 'error', tone: 'danger' },
  TOKEN_REFRESH: { label: 'Osvežavanje sesije', detail: 'Zabeleženo je osvežavanje sesije.', icon: 'refresh', tone: 'info' },
  TOKEN_REUSE: { label: 'Otkrivena ponovna upotreba tokena', detail: 'Zabeležena je ponovna upotreba tokena. Proverite aktivne prijave.', icon: 'alert', tone: 'warning' },
  SESSION_REVOKED: { label: 'Sesija opozvana', detail: 'Zabeleženo je opozivanje jedne sesije.', icon: 'logout', tone: 'warning' },
  ALL_SESSIONS_REVOKED: { label: 'Sve sesije opozvane', detail: 'Zabeleženo je opozivanje svih sesija.', icon: 'shieldX', tone: 'danger' },
  LOGOUT: { label: 'Odjava', detail: 'Zabeležena je odjava sa naloga.', icon: 'logout', tone: 'warning' },
}

export const securityFilters = [
  { value: 'all', label: 'Svi događaji' },
  { value: 'success', label: 'Uspešne prijave' },
  { value: 'failure', label: 'Neuspešne prijave' },
  { value: 'logout', label: 'Odjave' },
  { value: 'changes', label: 'Promene i opozivanja sesija' },
  { value: 'other', label: 'Ostali bezbednosni događaji' },
] as const
export type SecurityFilter = typeof securityFilters[number]['value']

export function matchesSecurityFilter(event: SecurityEventInfo, filter: SecurityFilter) {
  switch (filter) {
    case 'all': return true
    case 'success': return event.type === 'LOGIN_SUCCESS'
    case 'failure': return event.type === 'LOGIN_FAILURE'
    case 'logout': return event.type === 'LOGOUT'
    case 'changes': return ['TOKEN_REFRESH', 'SESSION_REVOKED', 'ALL_SESSIONS_REVOKED'].includes(event.type)
    case 'other': return event.type === 'TOKEN_REUSE'
  }
}

export function latestLogin(events: SecurityEventInfo[]) {
  return events.filter(event => event.type === 'LOGIN_SUCCESS' && Number.isFinite(Date.parse(event.occurredAt)))
    .reduce<SecurityEventInfo | null>((latest, event) => !latest || Date.parse(event.occurredAt) > Date.parse(latest.occurredAt) ? event : latest, null)
}

export function sessionDate(value: string) {
  return Number.isFinite(Date.parse(value)) ? formatBusinessDateTime(value, false, 'sr-Latn-RS') : 'Nema dostupnog podatka'
}

export function SessionTime({ value }: { value: string }) {
  return Number.isFinite(Date.parse(value)) ? <time dateTime={value}>{sessionDate(value)}</time> : <span>Nema dostupnog podatka</span>
}

export function deviceIcon(session: SessionInfo): SessionIconKind {
  const label = session.deviceLabel, agent = session.userAgentSummary
  if (/\b(ipad|tablet)\b/i.test(agent) || /\btablet\b/i.test(label)) return 'tablet'
  if (/\b(iphone|windows phone)\b/i.test(agent) || (/\bandroid\b/i.test(agent) && /\bmobile\b/i.test(agent)) || /\b(smartphone|telefon)\b/i.test(label)) return 'phone'
  if (/\b(laptop|notebook)\b/i.test(label)) return 'laptop'
  if (/\b(desktop|stoni računar)\b/i.test(label)) return 'monitor'
  return 'devices'
}

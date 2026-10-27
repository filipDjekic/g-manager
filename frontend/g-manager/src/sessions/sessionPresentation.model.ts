
import type { StatusTone } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { SecurityEventInfo, SecurityEventType, SessionInfo } from '../types/auth.types'
export type SessionIconKind = 'shield' | 'devices' | 'monitor' | 'laptop' | 'phone' | 'tablet' | 'clock' | 'alert'
  | 'refresh' | 'login' | 'logout' | 'error' | 'shieldX' | 'info'

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

export function deviceIcon(session: SessionInfo): SessionIconKind {
  const label = session.deviceLabel, agent = session.userAgentSummary
  if (/\b(ipad|tablet)\b/i.test(agent) || /\btablet\b/i.test(label)) return 'tablet'
  if (/\b(iphone|windows phone)\b/i.test(agent) || (/\bandroid\b/i.test(agent) && /\bmobile\b/i.test(agent)) || /\b(smartphone|telefon)\b/i.test(label)) return 'phone'
  if (/\b(laptop|notebook)\b/i.test(label)) return 'laptop'
  if (/\b(desktop|stoni računar)\b/i.test(label)) return 'monitor'
  return 'devices'
}

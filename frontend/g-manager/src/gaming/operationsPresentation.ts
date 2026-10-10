import { hasCapability } from '../auth/capabilities'
import type { AuthUser, Permission } from '../types/auth.types'
import type { GamingStationAction, GamingStationCard } from '../types/gamingSession.types'

const actionCapabilities: Record<GamingStationAction, Permission> = {
  START: 'GAMING_SESSION_START', EXTEND: 'GAMING_SESSION_EXTEND',
  TERMINATE: 'GAMING_SESSION_TERMINATE', FORCE_LOCK: 'GAMING_SESSION_TERMINATE', CONFIRM_LOCKED: 'GAMING_SESSION_TERMINATE',
}

export function permitsStationAction(actor: AuthUser | null, station: GamingStationCard, action: GamingStationAction) {
  return station.allowedActions.includes(action) && hasCapability(actor, actionCapabilities[action])
}

export function stationSeconds(station: GamingStationCard, now: number) {
  return station.sessionId && station.endsAt
    ? Math.max(0, Math.ceil((Date.parse(station.endsAt) - now) / 1000)) : station.remainingSeconds
}

export function isExpiringStation(station: GamingStationCard, now: number) {
  return !!station.sessionId && !!station.endsAt && Date.parse(station.endsAt) - now <= 600000
}

export function stationTimer(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds))
  return [Math.floor(value / 3600), Math.floor(value % 3600 / 60), value % 60]
    .map((part) => part.toString().padStart(2, '0')).join(':')
}

export function stationConnection(station: GamingStationCard) {
  if (!station.clientEnabled) return { label: 'Ručni režim', tone: 'neutral' as const }
  if (station.staleHeartbeat || station.status === 'OFFLINE') return { label: 'Bez potvrđene veze', tone: 'danger' as const }
  return { label: 'Klijent povezan', tone: 'success' as const }
}

export function stationMessage(station: GamingStationCard) {
  switch (station.status) {
    case 'LOCK_PENDING': return 'Čeka se potvrda lokalnog zaključavanja.'
    case 'OFFLINE': return 'Proverite mrežu i Windows servis klijenta.'
    case 'EXPIRED': return 'Sesija je istekla. Proverite stanje zaključavanja.'
    case 'MAINTENANCE': return 'Računar je na održavanju.'
    case 'RETIRED': return 'Računar je van upotrebe.'
    default: return station.allowedActions.includes('START') ? 'Spreman za novu sesiju' : 'Pokretanje sesije trenutno nije dozvoljeno. Proverite aplikacioni profil.'
  }
}

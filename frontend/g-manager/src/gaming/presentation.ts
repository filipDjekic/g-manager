import type { StatusTone } from '../components/ui'
import type { GamingStationCard } from '../types/gamingSession.types'

export const stationLabels: Record<GamingStationCard['status'], string> = {
  AVAILABLE: 'Dostupna', ACTIVE: 'Aktivna sesija', MAINTENANCE: 'Održavanje',
  RETIRED: 'Penzionisana', OFFLINE: 'Offline', EXPIRED: 'Sesija istekla', LOCK_PENDING: 'Čeka zaključavanje',
}
export const stationTones: Record<GamingStationCard['status'], StatusTone> = {
  AVAILABLE: 'success', ACTIVE: 'info', MAINTENANCE: 'warning', RETIRED: 'neutral',
  OFFLINE: 'danger', EXPIRED: 'warning', LOCK_PENDING: 'warning',
}
export const enforcementLabels: Record<string, string> = {
  UNKNOWN: 'Nepotvrđeno', UNLOCKED: 'Otključana', LOCK_PENDING: 'Čeka potvrdu', LOCKED: 'Zaključana', OFFLINE: 'Bez veze',
}
export function needsAttention(station: GamingStationCard) {
  return station.staleHeartbeat || ['OFFLINE', 'LOCK_PENDING', 'EXPIRED'].includes(station.status)
    || (!!station.commandSequence && !station.commandAcknowledgedAt)
}
export function remaining(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds))
  const hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60)
  return `${hours ? `${hours}h ` : ''}${minutes}m ${(value % 60).toString().padStart(2, '0')}s`
}

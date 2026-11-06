import type { StatusTone } from '../components/ui'
import type { GamingStationCard } from '../types/gamingSession.types'

export const stationLabels: Record<GamingStationCard['status'], string> = {
  WAITING_FOR_LOGIN: 'Čeka prijavu',
  CLIENT_ERROR: 'Potrebna provera Client-a',
  PREPARATION_REQUIRED: 'Potrebna priprema privatnosti', TRANSFER_PENDING: 'Rezervisano za premestanje',
  AVAILABLE: 'Slobodan', ACTIVE: 'Aktivna sesija', MAINTENANCE: 'Održavanje',
  RETIRED: 'Van upotrebe', OFFLINE: 'Bez veze', EXPIRED: 'Sesija istekla', LOCK_PENDING: 'Čeka zaključavanje',
}
export const stationTones: Record<GamingStationCard['status'], StatusTone> = {
  WAITING_FOR_LOGIN: 'warning',
  CLIENT_ERROR: 'danger',
  PREPARATION_REQUIRED: 'warning', TRANSFER_PENDING: 'warning',
  AVAILABLE: 'success', ACTIVE: 'info', MAINTENANCE: 'warning', RETIRED: 'neutral',
  OFFLINE: 'danger', EXPIRED: 'warning', LOCK_PENDING: 'warning',
}
export const enforcementLabels: Record<string, string> = {
  DEV_READY: 'Development spremna (simulirano)', DEV_ACTIVE: 'Development sesija (simulirano)', 
  UNKNOWN: 'Nepotvrđeno', UNLOCKED: 'Otključana', LOCK_PENDING: 'Čeka potvrdu', LOCKED: 'Zaključana', OFFLINE: 'Bez veze',
}
export function needsAttention(station: GamingStationCard) {
  return !!station.clientErrorCode || station.updateStatus === 'FAILED' || station.staleHeartbeat || ['CLIENT_ERROR', 'OFFLINE', 'LOCK_PENDING', 'EXPIRED', 'PREPARATION_REQUIRED', 'TRANSFER_PENDING'].includes(station.status)
    || (!!station.commandSequence && !station.commandAcknowledgedAt)
}
export function remaining(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds))
  const hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60)
  return `${hours ? `${hours}h ` : ''}${minutes}m ${(value % 60).toString().padStart(2, '0')}s`
}

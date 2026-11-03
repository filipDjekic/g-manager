
import { apiErrorMessage } from '../api/client'
import { stationLabels, stationTones, needsAttention } from '../gaming/presentation'
import type { StationOverview } from '../types/station.types'
import type { GamingStationCard } from '../types/gamingSession.types'
export interface StationView extends StationOverview { live?: GamingStationCard; availableClientVersion?: string }
export function isNewerClientVersion(available?: string, installed?: string) {
  const numeric = /^\d+\.\d+\.\d+(\.\d+)?$/
  if (!available || !numeric.test(available)) return false
  if (!installed || !numeric.test(installed)) return true
  const target = available.split('.').map(Number), current = installed.split('.').map(Number)
  for (let i = 0; i < 4; i++) {
    if ((target[i] || 0) !== (current[i] || 0)) return (target[i] || 0) > (current[i] || 0)
  }
  return false
}
export type StationTab = 'OVERVIEW' | 'CONFIGURATION' | 'APPLICATIONS' | 'HISTORY'
export const applicationTypeLabels = { GAME: 'Igra', LAUNCHER: 'Pokretač', HELPER: 'Pomoćna aplikacija' }
export const operationalLabels = { AVAILABLE: 'Dostupna', MAINTENANCE: 'Održavanje', RETIRED: 'Van upotrebe' }
export function stationStatus(station: StationView) {
  const status = station.live?.status ?? (station.effectiveStatus === 'IN_SESSION' ? 'ACTIVE' : station.effectiveStatus)
  return { value: status, label: stationLabels[status], tone: stationTones[status] }
}
export function connectionStatus(station: StationView) {
  if (!station.clientEnabled) return { key: 'MANUAL', label: 'Ručni režim', tone: 'neutral' as const }
  if (!station.lastHeartbeatAt) return { key: 'WAITING', label: 'Čeka prvi kontakt', tone: 'warning' as const }
  if (station.live ? station.live.staleHeartbeat || station.live.status === 'OFFLINE' : station.effectiveStatus === 'OFFLINE')
    return { key: 'OFFLINE', label: 'Bez veze', tone: 'danger' as const }
  return station.live ? { key: 'CONNECTED', label: 'Povezan', tone: 'success' as const }
    : { key: 'UNKNOWN', label: 'Veza nije potvrđena', tone: 'warning' as const }
}
export function stationWarnings(station: StationView) {
  const warnings: string[] = [], live = station.live, connection = connectionStatus(station)
  if (connection.key === 'OFFLINE') warnings.push('Gaming Client nije povezan. Proverite računar i mrežu.')
  if (connection.key === 'WAITING') warnings.push('Gaming Client još nije poslao prvi heartbeat.')
  if (live?.staleHeartbeat && station.lastHeartbeatAt) warnings.push('Heartbeat je zastareo.')
  if (live?.status === 'EXPIRED') warnings.push('Sesija je istekla. Proverite lokalno stanje računara.')
  if (live?.status === 'LOCK_PENDING' || live?.enforcementStatus === 'LOCK_PENDING') warnings.push('Zaključavanje čeka potvrdu. Nova sesija nije bezbedna dok se stanje ne potvrdi.')
  if (live?.commandSequence && !live.commandAcknowledgedAt) warnings.push(`Komanda #${live.commandSequence} čeka potvrdu klijenta.`)
  if (!station.stationProfileId || !station.applicationProfileId) warnings.push('Konfiguracija stanice ili profil aplikacija nisu podešeni.')
  if (station.operationalStatus === 'MAINTENANCE') warnings.push('Stanica je na održavanju.')
  if (station.operationalStatus === 'RETIRED') warnings.push('Stanica je trajno van upotrebe.')
  return warnings
}
export function problematicStation(station: StationView) {
  return station.operationalStatus !== 'AVAILABLE' || ['OFFLINE', 'WAITING'].includes(connectionStatus(station).key)
    || Boolean(station.live && (needsAttention(station.live) || station.live.enforcementStatus === 'LOCK_PENDING')) || !station.stationProfileId || !station.applicationProfileId
}
export function stationError(cause: unknown, fallback: string) {
  return apiErrorMessage(cause, fallback)
    .replace('Configuration was changed; refresh and try again', 'Konfiguracija je u međuvremenu promenjena. Ponovo otvorite podešavanja nakon osvežavanja.')
    .replace('Application is used by a profile', 'Aplikacija je deo profila i ne može biti obrisana.')
    .replace('Application profile is assigned to a station', 'Profil je dodeljen stanici i ne može biti obrisan.')
    .replace('Application profile code is already in use', 'Kod profila je već zauzet.')
    .replace('Application code is already in use', 'Kod aplikacije je već zauzet.')
    .replace('A retired station cannot be reactivated', 'Stanica van upotrebe ne može ponovo biti aktivirana.')
    .replace('A client-enabled station requires an active application profile', 'Uključen Gaming Client zahteva aktivan profil aplikacija.')
    .replace('Executable path must be an absolute Windows .exe path', 'Unesite apsolutnu Windows putanju do .exe datoteke.')
    .replace('Publisher or executable SHA-256 is required', 'Potreban je izdavač, sertifikat ili SHA-256 izvršne datoteke.')
    .replace('Application profile must include at least one game', 'Profil mora sadržati najmanje jednu igru.')
    .replace('Profile references an unavailable application', 'Profil sadrži neaktivnu ili nedostupnu aplikaciju.')
    .replace('Every launcher must share a dependency group with an explicitly allowed game', 'Svaki pokretač mora deliti grupu zavisnosti sa dozvoljenom igrom.')
    .replace('Application arguments must be a single command-line value', 'Argumenti moraju biti u jednom redu.')
    .replace('Application profile contains duplicate entries', 'Profil sadrži duplirane aplikacije.')
    .replace('Application profile is inactive', 'Profil aplikacija nije aktivan.')
    .replace('Application profile not found', 'Profil aplikacija nije pronađen.')
    .replace('Application definition not found', 'Aplikacija nije pronađena.')
    .replace('Gaming Client must be enabled before enrollment', 'Uključite Gaming Client u podešavanjima stanice pre upisa.')
    .replace('Station already has a machine identity', 'Stanica već ima identitet. Za promenu ključa koristite rotaciju.')
    .replace('Station has no active identity to rotate', 'Stanica nema aktivan identitet za rotaciju. Ponovo učitajte identitete.')
    .replace('Gaming station not found', 'Gaming stanica nije pronađena.')
    .replace('Only a gaming PC can have a station profile', 'Profil stanice može biti dodeljen samo gaming računaru.')
    .replace('Access is denied', 'Nemate dozvolu za ovu akciju.')
}

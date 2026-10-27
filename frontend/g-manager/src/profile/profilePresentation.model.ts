
import { apiErrorMessage } from '../api/client'
import { formatBusinessDateTime } from '../reservations/dateTime'
export function profileError(cause: unknown, fallback: string) {
  return apiErrorMessage(cause, fallback)
    .replace('Current password is incorrect', 'Trenutna lozinka nije ispravna.')
    .replace('New password must differ from the current password', 'Nova lozinka mora da se razlikuje od trenutne.')
    .replace('Document must be non-empty and within the configured size limit', 'Slika mora da sadrži podatke i da bude u okviru maksimalne veličine koju dozvoljava server.')
    .replace('Unsupported document format', 'Format slike nije podržan. Izaberite PNG ili JPEG.')
    .replace('File content does not match its MIME type', 'Sadržaj slike ne odgovara izabranom formatu.')
    .replace('Document quota exceeded', 'Dostignut je dozvoljeni broj dokumenata za ovaj nalog.')
    .replace('Access is denied', 'Nemate dozvolu za ovu izmenu.')
    .replace('User not found', 'Korisnički nalog nije dostupan.')
}
export function profileDate(value: string) {
  return Number.isNaN(new Date(value).valueOf()) ? 'Datum nije dostupan' : formatBusinessDateTime(value, false, 'sr-Latn-RS')
}
export function nameError(name: string) {
  const value = name.trim()
  return !value ? 'Unesite ime i prezime.' : value.length < 2 ? 'Ime mora imati najmanje 2 karaktera.'
    : value.length > 120 ? 'Ime može imati najviše 120 karaktera.' : ''
}
export function passwordErrors(current: string, next: string, confirmation: string) {
  return { current: !current.trim() ? 'Unesite trenutnu lozinku.' : '',
    next: !next.trim() ? 'Unesite novu lozinku.' : next.length < 8 ? 'Nova lozinka mora imati najmanje 8 karaktera.'
      : next.length > 100 ? 'Nova lozinka može imati najviše 100 karaktera.'
        : current && next === current ? 'Nova lozinka mora da se razlikuje od trenutne.' : '',
    confirmation: !confirmation ? 'Potvrdite novu lozinku.' : confirmation !== next ? 'Lozinke se ne poklapaju.' : '' }
}
export function passwordStrength(password: string): { level: number; label: string; tone: string } {
  if (!password) return { level: 0, label: 'Jačina lozinke', tone: 'empty' }
  if (password.length < 8 || /^(.)\1+$/.test(password) || /^(password|lozinka|qwerty|123456|abcdefgh)/i.test(password)) return { level: 1, label: 'Slaba', tone: 'weak' }
  const variety = Number(/\p{Ll}/u.test(password)) + Number(/\p{Lu}/u.test(password)) + Number(/\p{N}/u.test(password)) + Number(/[^\p{L}\p{N}\s]/u.test(password))
  if (password.length >= 16 && variety >= 2 || password.length >= 12 && variety >= 3) return { level: 4, label: 'Jaka', tone: 'strong' }
  if (password.length >= 12 || password.length >= 10 && variety >= 2) return { level: 3, label: 'Dobra', tone: 'good' }
  return { level: 2, label: 'Osrednja', tone: 'fair' }
}

export type ProfileIconKind = 'user' | 'camera' | 'lock' | 'mail' | 'shield' | 'check' | 'inactive' | 'save' | 'info' | 'devices' | 'eye' | 'eyeOff' | 'upload' | 'arrow' | 'close'

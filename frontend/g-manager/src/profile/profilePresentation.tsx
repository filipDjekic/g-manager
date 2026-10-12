import type { ReactNode } from 'react'
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
export function ProfileIcon({ kind, className = '' }: { kind: ProfileIconKind; className?: string }) {
  const paths: Record<ProfileIconKind, ReactNode> = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3z" /><circle cx="12" cy="13" r="4" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 7 9 6 9-6" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    inactive: <><circle cx="12" cy="12" r="9" /><path d="m8 8 8 8M16 8l-8 8" /></>,
    save: <><path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    devices: <><rect x="2" y="4" width="14" height="11" rx="2" /><rect x="17" y="9" width="5" height="12" rx="1" /><path d="M6 20h6M9 15v5" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10 5a10 10 0 0 1 12 7s-1 2-3 4M6 6c-2 2-4 6-4 6s4 7 10 7a12 12 0 0 0 5-1M10 10a3 3 0 0 0 4 4" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  }
  return <svg className={`gm-profile-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[kind]}</svg>
}

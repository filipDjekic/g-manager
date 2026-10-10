import type { ReservationStatus } from '../types/reservation.types'

export const reservationActionLabels: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: 'Potvrdi', REJECTED: 'Odbij', CANCELLED: 'Otkaži', COMPLETED: 'Završi',
}

export function ReservationIcon({ kind = 'calendar' }: { kind?: 'calendar' | 'clock' | 'users' | 'cancel' | 'search' | 'filter' }) {
  const paths = {
    calendar: 'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M7 2v4 M17 2v4 M3 9h18 M7 13h3 M14 13h3 M7 17h3',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    cancel: 'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M7 2v4 M17 2v4 M3 9h18 M9 13l6 5 M15 13l-6 5',
    search: 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0 M17 17l5 5',
    filter: 'M4 6h16 M7 12h10 M10 18h4',
  }
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[kind]} /></svg>
}

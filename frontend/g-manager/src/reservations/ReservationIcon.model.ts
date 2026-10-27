import type { ReservationStatus } from '../types/reservation.types'
export const reservationActionLabels: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: 'Potvrdi', REJECTED: 'Odbij', CANCELLED: 'Otkaži', COMPLETED: 'Završi',
}

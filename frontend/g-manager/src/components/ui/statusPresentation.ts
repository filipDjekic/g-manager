import type { StatusTone } from './index'
import type { ReservationStatus } from '../../types/reservation.types'
import type { OrderStatus } from '../../types/order.types'
import type { Role } from '../../types/auth.types'

export const reservationLabels: Record<ReservationStatus, string> = {
  PENDING: 'Na čekanju', CONFIRMED: 'Potvrđena', REJECTED: 'Odbijena', CANCELLED: 'Otkazana', COMPLETED: 'Završena',
}
export const reservationTones: Record<ReservationStatus, StatusTone> = {
  PENDING: 'warning', CONFIRMED: 'info', REJECTED: 'danger', CANCELLED: 'neutral', COMPLETED: 'success',
}
export const orderLabels: Record<OrderStatus, string> = {
  CREATED: 'Primljena', IN_PROGRESS: 'U pripremi', READY: 'Spremna za preuzimanje', COMPLETED: 'Završena', CANCELLED: 'Otkazana',
}
export const orderTones: Record<OrderStatus, StatusTone> = {
  CREATED: 'warning', IN_PROGRESS: 'info', READY: 'success', COMPLETED: 'neutral', CANCELLED: 'danger',
}
export const roleLabels: Record<Role, string> = { OWNER: 'Vlasnik', ADMIN: 'Administrator', EMPLOYEE: 'Zaposleni', CUSTOMER: 'Klijent' }

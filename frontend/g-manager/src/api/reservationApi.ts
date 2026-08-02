import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type {
  CreateReservationInput,
  Reservation,
  ReservationStatus,
} from '../types/reservation.types'

interface ReservationFilters {
  page: number
  size: number
  status?: ReservationStatus
  employeeId?: string
  from?: string
  to?: string
}

export const reservationApi = {
  create: (input: CreateReservationInput, idempotencyKey: string) =>
    apiClient.post<Reservation>('/reservations', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }).then(({ data }) => data),
  mine: (params: ReservationFilters) =>
    apiClient.get<PageResponse<Reservation>>('/reservations/me', { params })
      .then(({ data }) => data),
  list: (params: ReservationFilters) =>
    apiClient.get<PageResponse<Reservation>>('/reservations', { params })
      .then(({ data }) => data),
  changeStatus: (
    reservation: Reservation,
    status: ReservationStatus,
    note?: string,
  ) => apiClient.patch<Reservation>(`/reservations/${reservation.id}/status`, {
    status,
    note,
    version: reservation.version,
  }).then(({ data }) => data),
}

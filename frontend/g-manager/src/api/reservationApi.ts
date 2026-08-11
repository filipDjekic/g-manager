import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type {
  CreateReservationInput,
  Reservation,
  ReservationDetail,
  ReservationStatus,
} from '../types/reservation.types'
import type { BulkItem, BulkOperationResponse } from '../types/bulk.types'

interface ReservationFilters {
  page: number
  size: number
  status?: ReservationStatus
  employeeId?: string
  from?: string
  to?: string
  sort?: 'startTime' | 'status' | 'createdAt'
  direction?: 'ASC' | 'DESC'
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
  detail: (id: string) =>
    apiClient.get<ReservationDetail>(`/reservations/${id}`).then(({ data }) => data),
  changeStatus: (
    reservation: Pick<Reservation, 'id' | 'version'>,
    status: ReservationStatus,
    note?: string,
  ) => apiClient.patch<Reservation>(`/reservations/${reservation.id}/status`, {
    status,
    note,
    version: reservation.version,
  }).then(({ data }) => data),
  bulkStatus: (status: ReservationStatus, items: BulkItem[], note?: string) =>
    apiClient.patch<BulkOperationResponse>('/reservations/bulk/status', { status, note, items })
      .then(({ data }) => data),
}

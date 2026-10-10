import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type {
  CreateReservationInput,
  UpdateReservationInput,
  ReservationScope,
  Reservation,
  ReservationDetail,
  ReservationStatus,
  ReservationSummary,
  ReservationBookingPlan,
  CalendarContext,
  CalendarReservation,
  RecurrenceInput,
  RecurrencePreview,
  RecurrenceCreateResult,
} from '../types/reservation.types'
import type { BookingOptions } from '../types/resource.types'
import type { BulkItem, BulkOperationResponse } from '../types/bulk.types'

export interface ReservationFilters {
  page: number
  size: number
  status?: ReservationStatus
  employeeId?: string
  customerId?: string
  resourceId?: string
  locationId?: string
  areaId?: string
  scope?: ReservationScope
  from?: string
  to?: string
  sort?: 'startTime' | 'endTime' | 'status' | 'createdAt'
  direction?: 'ASC' | 'DESC'
  search?: string
}

export const reservationApi = {
  calendarContext: (params: {date: string; scope?: ReservationScope; locationId?: string; areaId?: string; resourceId?: string; employeeId?: string}) =>
    apiClient.get<CalendarContext>('/reservations/calendar-context', {params}).then(({data}) => data),
  bookingPlan: (params: {serviceId: string; employeeId?: string; resourceId?: string; locationId?: string; areaId?: string; date: string; start?: string; durationMinutes?: number}) =>
    apiClient.get<ReservationBookingPlan>('/reservations/booking-plan', {params}).then(({data}) => data),
  calendar: (params: { employeeId?: string; from: string; to: string; scope?: ReservationScope; resourceId?: string; locationId?: string; areaId?: string; customerId?: string; status?: ReservationStatus }) =>
    apiClient.get<CalendarReservation[]>('/reservations/calendar', { params }).then(({ data }) => data),
  create: (input: CreateReservationInput, idempotencyKey: string) =>
    apiClient.post<Reservation>('/reservations', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }).then(({ data }) => data),
  previewRecurrence: (input: RecurrenceInput) =>
    apiClient.post<RecurrencePreview>('/reservations/recurrence/preview', input).then(({ data }) => data),
  createRecurrence: (input: RecurrenceInput, idempotencyKey: string) =>
    apiClient.post<RecurrenceCreateResult>('/reservations/recurrence', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }).then(({ data }) => data),
  mine: (params: ReservationFilters) =>
    apiClient.get<PageResponse<Reservation>>('/reservations/me', { params })
      .then(({ data }) => data),
  list: (params: ReservationFilters) =>
    apiClient.get<PageResponse<Reservation>>('/reservations', { params })
      .then(({ data }) => data),
  summary: (params: Omit<ReservationFilters, 'page' | 'size' | 'sort' | 'direction' | 'status'>) =>
    apiClient.get<ReservationSummary>('/reservations/summary', { params }).then(({ data }) => data),
  detail: (id: string) =>
    apiClient.get<ReservationDetail>(`/reservations/${id}`).then(({ data }) => data),
  update: (id: string, input: UpdateReservationInput) =>
    apiClient.patch<Reservation>(`/reservations/${id}`, input).then(({ data }) => data),
  resourceOptions: (id: string, startTime?: string) =>
    apiClient.get<BookingOptions>(`/reservations/${id}/resources`, { params: { startTime } }).then(({ data }) => data),
  assignResource: (reservation: Pick<Reservation, 'id' | 'version'>, resourceId: string) =>
    apiClient.patch<Reservation>(`/reservations/${reservation.id}/resource`, {
      resourceId, version: reservation.version,
    }).then(({ data }) => data),
  changeStatus: (
    reservation: Pick<Reservation, 'id' | 'version'>,
    status: ReservationStatus,
    reason?: string,
  ) => apiClient.patch<Reservation>(`/reservations/${reservation.id}/status`, {
    status,
    reason,
    version: reservation.version,
  }).then(({ data }) => data),
  bulkStatus: (status: ReservationStatus, items: BulkItem[], reason?: string) =>
    apiClient.patch<BulkOperationResponse>('/reservations/bulk/status', { status, reason, items })
      .then(({ data }) => data),
}

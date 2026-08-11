export type ReservationStatus =
  | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'

export interface Reservation {
  id: string
  customerId: string
  employeeId: string
  serviceId: string
  recurrenceSeriesId?: string | null
  startTime: string
  endTime: string
  status: ReservationStatus
  note: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export interface ReservationHistoryItem {
  fromStatus: ReservationStatus
  toStatus: ReservationStatus
  reason: string | null
  occurredAt: string
}

export interface ReservationDetail {
  id: string
  customerName: string
  customerContact: string | null
  employeeName: string
  serviceName: string
  durationMinutes: number | null
  startTime: string
  endTime: string
  status: ReservationStatus
  note: string | null
  createdAt: string
  updatedAt: string
  version: number
  allowedActions: ReservationStatus[]
  history: ReservationHistoryItem[]
}

export interface CreateReservationInput {
  employeeId?: string
  serviceId: string
  startTime: string
  note?: string
}

export type RecurrenceFrequency = 'WEEKLY' | 'MONTHLY'
export type RecurrenceConflictPolicy = 'ALL_OR_NOTHING' | 'SKIP_CONFLICTS'
export interface RecurrenceInput extends CreateReservationInput {
  employeeId: string
  frequency: RecurrenceFrequency
  interval: number
  occurrences: number
  conflictPolicy: RecurrenceConflictPolicy
}
export interface RecurrenceOccurrence { startTime: string; endTime: string; available: boolean; reason: string | null }
export interface RecurrencePreview { timezone: string; occurrences: RecurrenceOccurrence[] }
export interface RecurrenceCreateResult { seriesId: string; created: Reservation[]; skipped: RecurrenceOccurrence[] }

export interface CalendarReservation {
  id: string
  employeeId: string
  employeeName: string
  customerName: string
  serviceName: string
  startTime: string
  endTime: string
  status: ReservationStatus
  version: number
  allowedActions: ReservationStatus[]
}

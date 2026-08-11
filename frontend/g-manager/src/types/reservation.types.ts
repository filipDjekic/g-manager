export type ReservationStatus =
  | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'

export interface Reservation {
  id: string
  customerId: string
  employeeId: string
  serviceId: string
  startTime: string
  endTime: string
  status: ReservationStatus
  note: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export interface ReservationHistoryItem {
  action: string
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
  employeeId: string
  serviceId: string
  startTime: string
  note?: string
}

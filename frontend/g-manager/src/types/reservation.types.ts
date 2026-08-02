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

export interface CreateReservationInput {
  employeeId: string
  serviceId: string
  startTime: string
  note?: string
}

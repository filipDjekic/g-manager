export type ReservationStatus =
  | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'

export interface Reservation {
  id: string
  serviceName?: string
  customerName?: string
  employeeName?: string
  allowedActions?: ReservationStatus[]
  customerId: string | null
  employeeId: string
  serviceId: string
  locationId?: string | null
  resourceId?: string | null
  recurrenceSeriesId?: string | null
  resourceCode?: string | null
  resourceName?: string | null
  locationName?: string | null
  resourceRequired?: boolean
  canManage?: boolean
  readOnly?: boolean
  canEdit?: boolean
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
  serviceId?: string
  locationId?: string | null
  locationName?: string | null
  resourceId?: string | null
  resourceCode?: string | null
  resourceName?: string | null
  resourceRequired?: boolean
  canManage?: boolean
  readOnly?: boolean
  canEdit?: boolean
  canAssignResource?: boolean
}

export type ReservationScope = 'ALL' | 'MANAGEABLE'

export interface UpdateReservationInput { version: number; startTime?: string; resourceId?: string; note?: string }

export interface CreateReservationInput {
  customerId?: string
  employeeId?: string
  serviceId: string
  resourceId?: string
  locationId?: string
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
export interface RecurrenceOccurrence {
  startTime: string; endTime: string; available: boolean; reason: string | null
  resourceId?: string | null; resourceCode?: string | null; resourceName?: string | null
  locationId?: string | null; locationName?: string | null
}
export interface RecurrencePreview { timezone: string; occurrences: RecurrenceOccurrence[]; availableCount?: number; conflictCount?: number; reservationsToCreate?: number }
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
  resourceId?:string;resourceName?:string;resourceCode?:string;locationName?:string;canManage?:boolean;readOnly?:boolean
}

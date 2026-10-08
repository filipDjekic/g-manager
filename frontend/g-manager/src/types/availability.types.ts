export type BookingSlotStatus = 'AVAILABLE' | 'OCCUPIED_RESERVATION' | 'OCCUPIED_RESOURCE' | 'OCCUPIED_SESSION' | 'UNAVAILABLE'

export interface AvailabilitySlot {
  status?: BookingSlotStatus
  reason?: string | null
  employeeId?: string
  employeeName?: string
  startTime: string
  endTime: string
  resourceId?: string | null
  resourceCode?: string | null
  resourceName?: string | null
  locationId?: string | null
  locationName?: string | null
}

export interface EmployeeAvailability {
  employeeId: string
  employeeName: string
  slots: AvailabilitySlot[]
}

export interface AvailabilityResponse {
  serverTime?: string
  timezone: string
  serviceId: string
  serviceName: string
  durationMinutes: number
  slotIncrementMinutes: number
  from: string
  to: string
  employees: EmployeeAvailability[]
  resourceId?:string;resourceName?:string
  resourceRequired?: boolean
}

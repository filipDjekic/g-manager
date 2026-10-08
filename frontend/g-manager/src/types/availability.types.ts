export interface AvailabilitySlot {
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

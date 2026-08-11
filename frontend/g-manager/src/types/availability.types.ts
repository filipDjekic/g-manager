export interface AvailabilitySlot {
  startTime: string
  endTime: string
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
}

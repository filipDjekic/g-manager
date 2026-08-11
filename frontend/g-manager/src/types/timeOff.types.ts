export type TimeOffStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface TimeOff {
  id: string
  employeeId: string
  startsAt: string
  endsAt: string
  status: TimeOffStatus
  reason: string
  decisionReason: string | null
  version: number
}

export interface TimeOffInput {
  employeeId: string
  startsAt: string
  endsAt: string
  reason: string
}

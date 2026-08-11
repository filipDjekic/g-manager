export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'ACCEPTED' | 'CANCELLED'

export interface WaitlistEntry {
  id: string
  serviceId: string
  employeeId: string
  desiredStart: string
  status: WaitlistStatus
  offerId: string | null
  offerExpiresAt: string | null
  reservationId: string | null
  version: number
}

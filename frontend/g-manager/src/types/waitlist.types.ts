export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'ACCEPTED' | 'CANCELLED'

export interface WaitlistEntry {
  id: string
  serviceId: string
  employeeId: string
  locationId: string | null
  resourceId: string | null
  desiredStart: string
  desiredEnd: string | null
  status: WaitlistStatus
  offerId: string | null
  offerExpiresAt: string | null
  reservationId: string | null
  version: number
}

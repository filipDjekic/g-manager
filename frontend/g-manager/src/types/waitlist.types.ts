export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'ACCEPTED' | 'CANCELLED'
export type WaitlistOfferStatus = 'OFFERED' | 'ACCEPTED' | 'EXPIRED'

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
  serviceName?: string | null
  employeeName?: string | null
  locationName?: string | null
  resourceCode?: string | null
  resourceName?: string | null
  offerStatus?: WaitlistOfferStatus | null
  createdAt?: string
  serverTime?: string
}
export interface WaitlistOperationalEntry {
  id: string; customerId: string; customerName: string; employeeId: string; employeeName: string
  serviceId: string; serviceName: string; locationId?: string; locationName?: string; resourceId?: string; resourceName?: string; resourceCode?: string
  createdAt: string; desiredStart: string; desiredEnd?: string; status: WaitlistStatus; offerId?: string; offerExpiresAt?: string
  offerStatus?: WaitlistOfferStatus; serverTime?: string; stationManageable: boolean; readOnly: boolean; version: number
}

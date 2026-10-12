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
  serviceId: string; serviceName: string; locationId: string | null; locationName: string | null; resourceId: string | null; resourceName: string | null; resourceCode: string | null
  createdAt: string; desiredStart: string; desiredEnd: string | null; status: WaitlistStatus; offerId: string | null; offerExpiresAt: string | null
  offerStatus: WaitlistOfferStatus | null; serverTime: string; stationManageable: boolean; readOnly: boolean; version: number
  customerEmail: string | null; customerActive: boolean; durationMinutes: number; resourceType: string | null
  areaId: string | null; areaName: string | null; queueEnteredAt: string; internalNote: string | null
  createdById: string | null; createdByName: string | null; consentAt: string | null; offerCreatedAt: string | null
  offeredResourceId: string | null; offeredResourceName: string | null; reservationId: string | null
  allowedActions: Array<'DETAILS' | 'EDIT' | 'CANCEL' | 'CALENDAR' | 'CUSTOMER'>
}

export interface WaitlistHistoryEvent {
  id: string; type: 'ENTRY_CREATED' | 'ENTRY_UPDATED' | 'OFFER_CREATED' | 'OFFER_EXPIRED' | 'OFFER_INVALIDATED' | 'OFFER_ACCEPTED' | 'ENTRY_CANCELLED'
  occurredAt: string; actorId: string | null; actorName: string | null; offerId: string | null; reason: string | null
}
export interface WaitlistDetail { entry: WaitlistOperationalEntry; history: WaitlistHistoryEvent[] }
export interface WaitlistStatistics {
  active: number; waiting: number; offered: number; accepted: number; cancelled: number; expiredOffers: number
  periodStart: string; periodEnd: string; serverTime: string
}
export interface ManageWaitlistInput {
  customerId: string; serviceId: string; employeeId: string; locationId?: string; areaId?: string; resourceId?: string
  desiredStart: string; internalNote?: string; customerConsent?: boolean; version?: number
}
export type WaitlistSort = 'FIFO' | 'NEWEST' | 'START_ASC' | 'START_DESC'
export interface WaitlistFilters {
  status?: WaitlistStatus | 'ALL'; search?: string; customerId?: string; date?: string
  serviceId?: string; locationId?: string; areaId?: string; resourceId?: string; sort?: WaitlistSort; page: number; size: number
}

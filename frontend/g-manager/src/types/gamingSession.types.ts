import type { Purchase } from '../api/gamingBillingApi'
export type GamingSessionStatus = 'ACTIVE'|'EXPIRED'|'TERMINATED'
export interface GamingSession {
  id:string;customerId?:string;resourceId:string;locationId:string;reservationId?:string
  startedBy:string;startedAt:string;endsAt:string;endedAt?:string;status:GamingSessionStatus
  terminationReason?:string;remainingSeconds:number;serverTime:string;version:number
  billingMode?: 'FIXED_DURATION' | 'PREPAID_METERED'; billedSeconds?:number; chargedAmount?:string|number
  lastCommandSequence?:number
}
export interface StartGamingSessionInput { billingMode?: 'FIXED_DURATION' | 'PREPAID_METERED'; meteredTariffId?:string; customerId?:string;guestName?:string;purchase?:Purchase;resourceId:string;reservationId?:string;durationMinutes?:number }
export interface GamingSessionEvent { eventId:string;type:string;sessionId:string;occurredAt:string }
export type GamingStationBoardStatus = 'CLIENT_ERROR'|'PREPARATION_REQUIRED'|'TRANSFER_PENDING'|'AVAILABLE'|'ACTIVE'|'MAINTENANCE'|'RETIRED'|'OFFLINE'|'EXPIRED'|'LOCK_PENDING'
export type GamingStationAction = 'START'|'EXTEND'|'TERMINATE'|'FORCE_LOCK'|'CONFIRM_LOCKED'
export interface GamingStationCard {
  billingMode?: 'FIXED_DURATION' | 'PREPAID_METERED'; billedSeconds?:number; chargedAmount?:string|number; walletBalance?:string|number
  resourceId:string;resourceCode:string;resourceName:string;locationId:string
  status:GamingStationBoardStatus;clientEnabled:boolean;lastHeartbeatAt?:string;staleHeartbeat:boolean
  enforcementStatus:'DEV_READY'|'UNKNOWN'|'UNLOCKED'|'LOCK_PENDING'|'LOCKED'|'OFFLINE';lastLockAckAt?:string
  sessionId?:string;customerId?:string;customerDisplayName?:string;startedAt?:string;endsAt?:string
  remainingSeconds:number;sessionVersion?:number;allowedActions:GamingStationAction[]
  areaId?:string;operationalStatus?:string;effectiveStatus?:string;applicationProfileName?:string
  configurationVersion?:number;clientVersion?:string;commandSequence?:number;commandType?:string
  commandAvailableAt?:string;commandAcknowledgedAt?:string
  latestSessionId?:string;paymentDue?:string|number;privacyReady?:boolean;moveTargetId?:string
  locationName?:string;areaName?:string
  clientErrorCode?:string;updateStatus?:string;maintenanceActive?:boolean
}
export interface GamingOperationsBoard { serverTime:string;stations:GamingStationCard[] }
export interface StationHistoryEntry { occurredAt:string;category:'COMMAND'|'ENFORCEMENT';action:string;status:string;commandSequence?:number;correlationId?:string;details?:string }
export interface StationHistory { serverTime:string;stationId:string;entries:StationHistoryEntry[] }
export interface GamingSessionVisit {
  billingMode?: 'FIXED_DURATION' | 'PREPAID_METERED'; billedSeconds?:number; chargedAmount?:string|number
  id:string;resourceId:string;resourceName:string;locationId:string;startedAt:string;endsAt:string
  endedAt?:string;status:GamingSessionStatus;serverTime:string;remainingSeconds:number
}

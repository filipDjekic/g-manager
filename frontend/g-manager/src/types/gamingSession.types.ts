export type GamingSessionStatus = 'ACTIVE'|'EXPIRED'|'TERMINATED'
export interface GamingSession {
  id:string;customerId:string;resourceId:string;locationId:string;reservationId?:string
  startedBy:string;startedAt:string;endsAt:string;endedAt?:string;status:GamingSessionStatus
  terminationReason?:string;remainingSeconds:number;serverTime:string;version:number
  lastCommandSequence?:number
}
export interface StartGamingSessionInput { customerId:string;resourceId:string;reservationId?:string;durationMinutes?:number }
export interface GamingSessionEvent { eventId:string;type:string;sessionId:string;occurredAt:string }
export type GamingStationBoardStatus = 'AVAILABLE'|'ACTIVE'|'MAINTENANCE'|'RETIRED'|'OFFLINE'|'EXPIRED'|'LOCK_PENDING'
export type GamingStationAction = 'START'|'EXTEND'|'TERMINATE'|'FORCE_LOCK'|'CONFIRM_LOCKED'
export interface GamingStationCard {
  resourceId:string;resourceCode:string;resourceName:string;locationId:string
  status:GamingStationBoardStatus;clientEnabled:boolean;lastHeartbeatAt?:string;staleHeartbeat:boolean
  enforcementStatus:'UNKNOWN'|'UNLOCKED'|'LOCK_PENDING'|'LOCKED'|'OFFLINE';lastLockAckAt?:string
  sessionId?:string;customerId?:string;customerDisplayName?:string;startedAt?:string;endsAt?:string
  remainingSeconds:number;sessionVersion?:number;allowedActions:GamingStationAction[]
}
export interface GamingOperationsBoard { serverTime:string;stations:GamingStationCard[] }

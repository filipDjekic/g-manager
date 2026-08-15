export type GamingSessionStatus = 'ACTIVE'|'EXPIRED'|'TERMINATED'
export interface GamingSession {
  id:string;customerId:string;resourceId:string;locationId:string;reservationId?:string
  startedBy:string;startedAt:string;endsAt:string;endedAt?:string;status:GamingSessionStatus
  terminationReason?:string;remainingSeconds:number;serverTime:string;version:number
}
export interface StartGamingSessionInput { customerId:string;resourceId:string;reservationId?:string;durationMinutes?:number }

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
export interface WaitlistOperationalEntry {
  id:string;customerId:string;customerName:string;employeeId:string;employeeName:string
  serviceId:string;serviceName:string;locationId?:string;locationName?:string;resourceId?:string;resourceName?:string
  createdAt:string;desiredStart:string;desiredEnd?:string;status:'WAITING'|'OFFERED';offerId?:string;offerExpiresAt?:string
}

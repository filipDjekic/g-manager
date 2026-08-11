import type { PageResponse } from './api.types'

export interface CustomerListItem {
  id: string
  name: string
  email: string
  active: boolean
  registeredAt: string
  reservationCount: number
  completedAppointmentCount: number
  orderCount: number
  completedOrderCount: number
  completedOrderRevenue: number
  lastActivityAt: string | null
}

export interface CustomerReservationHistory {
  id: string
  serviceName: string
  startTime: string
  endTime: string
  status: string
}

export interface CustomerOrderHistory {
  id: string
  status: string
  totalPrice: number
  createdAt: string
}

export interface CustomerDetail {
  customer: CustomerListItem
  reservations: CustomerReservationHistory[]
  orders: CustomerOrderHistory[]
}

export type CustomerPage = PageResponse<CustomerListItem>

export interface CustomerCrmNote {
  id: string
  body: string
  createdBy: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  version: number
}

export interface CustomerCrm {
  customerId: string
  version: number
  notes: CustomerCrmNote[]
  tags: string[]
}

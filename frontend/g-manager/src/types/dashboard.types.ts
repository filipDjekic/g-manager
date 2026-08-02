import type { ReservationStatus } from './reservation.types'

export interface DashboardSummary {
  totalRevenueCompleted: number
  completedOrdersCount: number
  reservationsByStatus: Record<ReservationStatus, number>
}

export interface DashboardToday {
  pendingReservationsToMe: number
  confirmedTodayCount: number
  unclaimedOrdersCount: number
  myInProgressOrdersCount: number
}

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

export interface DashboardMetric { current: number; previous: number; absoluteChange: number; percentChange: number | null }
export interface DashboardTrendBucket { date: string; completedRevenue: number; completedOrders: number; reservations: number }
export interface DashboardTrends {
  from: string; to: string; previousFrom: string; previousTo: string; timezone: string; grain: 'DAY'
  revenue: DashboardMetric; completedOrders: DashboardMetric; reservations: DashboardMetric
  reservationsByStatus: Record<ReservationStatus, number>; buckets: DashboardTrendBucket[]
}
export interface DashboardWorkloadItem {
  employeeId: string; employeeName: string; reservationCount: number; reservedMinutes: number
  capacityMinutes: number; utilizationPercent: number | null
}
export interface DashboardWorkload {
  from: string; to: string; timezone: string; capacityDefinition: string; employees: DashboardWorkloadItem[]
}
export interface DashboardWidgetPreference {
  widgetKey: string; position: number; visible: boolean; threshold: number | null
}

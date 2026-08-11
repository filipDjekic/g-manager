import type { ReservationStatus } from './reservation.types'

export interface DashboardSummary {
  totalRevenueCompleted: number
  completedOrdersCount: number
  reservationsByStatus: Record<ReservationStatus, number>
}

export interface DashboardToday {
  date: string; timezone: string; workingDayStart: string | null; workingDayEnd: string | null
  appointments: Array<{ id: string; customerName: string; serviceName: string; startTime: string; endTime: string
    status: ReservationStatus; version: number; allowedActions: ReservationStatus[] }>
  gaps: Array<{ startTime: string; endTime: string }>
  unclaimedOrders: DashboardTodayOrder[]; assignedOrders: DashboardTodayOrder[]
  attentionNotifications: Array<{ id: string; priority: 'LOW' | 'NORMAL' | 'HIGH'; title: string; body: string; createdAt: string }>
}
export interface DashboardTodayOrder { id: string; status: import('./order.types').OrderStatus; totalPrice: number
  createdAt: string; version: number; allowedActions: import('./order.types').OrderStatus[] }

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
export interface DashboardAttentionItem { key: string; label: string; detail: string; count: number
  severity: 'info' | 'warning' | 'critical'; url: string }
export interface DashboardAttention { date: string; timezone: string; workloadThresholdPercent: number
  items: DashboardAttentionItem[] }

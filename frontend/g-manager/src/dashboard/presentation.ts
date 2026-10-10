import type { OrderStatus } from '../types/order.types'
import type { ReservationStatus } from '../types/reservation.types'
import type { DashboardAttentionItem } from '../types/dashboard.types'
import { formatBusinessDateTime } from '../reservations/dateTime'

const money = new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'RSD', maximumFractionDigits: 2 })
const calendarDate = new Intl.DateTimeFormat('sr-RS', { dateStyle: 'long', timeZone: 'UTC' })
const chartDate = new Intl.DateTimeFormat('sr-RS', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

export const formatDashboardMoney = (value: number) => money.format(value)
export const formatDashboardDate = (value: string) => calendarDate.format(new Date(`${value}T12:00:00Z`))
export const formatChartDate = (value: string) => chartDate.format(new Date(`${value}T12:00:00Z`))

export function formatAttentionDetail(item: DashboardAttentionItem): string {
  if (!item.key.startsWith('next-')) return item.detail
  const separator = item.detail.lastIndexOf(' · ')
  if (separator < 0) return item.detail
  const instant = item.detail.slice(separator + 3)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(instant) || !Number.isFinite(Date.parse(instant))) return item.detail
  return `${item.detail.slice(0, separator)} · ${formatBusinessDateTime(instant)}`
}

export const dashboardActionLabels: Partial<Record<ReservationStatus | OrderStatus, string>> = {
  CONFIRMED: 'Potvrdi', REJECTED: 'Odbij', CANCELLED: 'Otkaži', COMPLETED: 'Završi',
  IN_PROGRESS: 'Preuzmi', READY: 'Označi spremno',
}

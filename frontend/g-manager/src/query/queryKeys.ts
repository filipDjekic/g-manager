import type { SavedViewResource } from '../api/savedViewApi'

export const queryKeys = {
  catalog: (query: string) => ['catalog', query] as const,
  users: (query: string) => ['users', query] as const,
  customers: (query: string) => ['customers', query] as const,
  customerDetail: (id: string) => ['customers', 'detail', id] as const,
  reservations: (query: string) => ['reservations', query] as const,
  reservationDetail: (id: string) => ['reservations', 'detail', id] as const,
  reservationCalendar: (from: string, to: string, employeeId?: string) =>
    ['reservations', 'calendar', from, to, employeeId ?? 'me'] as const,
  orders: (query: string) => ['orders', query] as const,
  savedViews: (resource: SavedViewResource) => ['saved-views', resource] as const,
}

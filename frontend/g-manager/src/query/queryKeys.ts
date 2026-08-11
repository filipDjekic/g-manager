import type { SavedViewResource } from '../api/savedViewApi'

export const queryKeys = {
  catalog: (query: string) => ['catalog', query] as const,
  users: (query: string) => ['users', query] as const,
  reservations: (query: string) => ['reservations', query] as const,
  reservationDetail: (id: string) => ['reservations', 'detail', id] as const,
  orders: (query: string) => ['orders', query] as const,
  savedViews: (resource: SavedViewResource) => ['saved-views', resource] as const,
}

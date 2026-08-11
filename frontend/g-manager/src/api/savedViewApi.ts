import { apiClient } from './client'

export type SavedViewResource = 'CATALOG' | 'USERS' | 'CUSTOMERS' | 'RESERVATIONS' | 'ORDERS'
export interface SavedView {
  id: string; resourceType: SavedViewResource; name: string
  query: Record<string, string>; version: number
}

export const savedViewApi = {
  list: (resourceType: SavedViewResource) =>
    apiClient.get<SavedView[]>('/saved-views', { params: { resourceType } }).then(({ data }) => data),
  create: (resourceType: SavedViewResource, name: string, query: Record<string, string>) =>
    apiClient.post<SavedView>('/saved-views', { resourceType, name, query }).then(({ data }) => data),
  update: (view: SavedView, name: string, query: Record<string, string>) =>
    apiClient.patch<SavedView>(`/saved-views/${view.id}`, {
      resourceType: view.resourceType, name, query, version: view.version,
    }).then(({ data }) => data),
  remove: (view: SavedView) => apiClient.delete(`/saved-views/${view.id}`, { params: { version: view.version } }),
}

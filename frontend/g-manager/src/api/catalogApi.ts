import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemUpdate,
  ItemType,
} from '../types/catalog.types'
import type { BulkItem, BulkOperationResponse } from '../types/bulk.types'

export interface CatalogFilters {
  page: number
  size: number
  type?: ItemType
  active?: boolean
  search?: string
  minPrice?: number
  maxPrice?: number
  sort?: 'name' | 'price' | 'type' | 'createdAt'
  direction?: 'ASC' | 'DESC'
}

export const catalogApi = {
  list: (params: CatalogFilters) =>
    apiClient.get<PageResponse<CatalogItem>>('/catalog', { params }).then(({ data }) => data),
  create: (request: CatalogItemInput) =>
    apiClient.post<CatalogItem>('/catalog', request).then(({ data }) => data),
  update: (id: string, request: CatalogItemUpdate) =>
    apiClient.patch<CatalogItem>(`/catalog/${id}`, request).then(({ data }) => data),
  deactivate: (item: CatalogItem) =>
    apiClient.patch<CatalogItem>(`/catalog/${item.id}/deactivate`, undefined, {
      params: { version: item.version },
    }).then(({ data }) => data),
  activate: (item: CatalogItem) =>
    apiClient.patch<CatalogItem>(`/catalog/${item.id}/activate`, undefined, {
      params: { version: item.version },
    }).then(({ data }) => data),
  bulkActivation: (action: 'ACTIVATE' | 'DEACTIVATE', items: BulkItem[]) =>
    apiClient.post<BulkOperationResponse>('/catalog/bulk/activation', { action, items }).then(({ data }) => data),
  deleted: (page = 0, size = 20) =>
    apiClient.get<PageResponse<CatalogItem>>('/catalog/deleted', { params: { page, size } })
      .then(({ data }) => data),
  remove: (id: string, reason: string) =>
    apiClient.delete<void>(`/catalog/${id}`, { data: { reason } }),
  restore: (id: string) =>
    apiClient.post<CatalogItem>(`/catalog/${id}/restore`).then(({ data }) => data),
  uploadImage: (item: CatalogItem, image: File) => {
    const form = new FormData()
    form.append('image', image)
    return apiClient.post<CatalogItem>(`/catalog/${item.id}/image`, form, {
      params: { version: item.version },
    }).then(({ data }) => data)
  },
}

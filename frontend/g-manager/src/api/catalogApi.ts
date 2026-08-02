import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemUpdate,
  ItemType,
} from '../types/catalog.types'

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
  uploadImage: (item: CatalogItem, image: File) => {
    const form = new FormData()
    form.append('image', image)
    return apiClient.post<CatalogItem>(`/catalog/${item.id}/image`, form, {
      params: { version: item.version },
    }).then(({ data }) => data)
  },
}

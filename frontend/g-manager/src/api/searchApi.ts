import { apiClient } from './client'

export type SearchResourceType = 'CATALOG' | 'USER' | 'ORDER' | 'RESERVATION'
export interface NavigationAction { kind: 'NAVIGATE'; label: string; url: string }
export interface SearchResult {
  type: SearchResourceType; id: string; title: string; subtitle: string; url: string; action: NavigationAction; favorite: boolean
}
export interface SearchResponse { results: SearchResult[]; limit: number }

export const searchApi = {
  search: (query: string, signal?: AbortSignal) =>
    apiClient.get<SearchResponse>('/search', { params: { q: query, limit: 20 }, signal }).then(({ data }) => data),
  preferences: (favoritesOnly: boolean, signal?: AbortSignal) =>
    apiClient.get<SearchResult[]>('/search/preferences', { params: { favoritesOnly }, signal }).then(({ data }) => data),
  remember: (result: SearchResult, favorite: boolean) =>
    apiClient.post<SearchResult>('/search/preferences', { type: result.type, id: result.id, favorite }).then(({ data }) => data),
  removeFavorite: (result: SearchResult) =>
    apiClient.delete('/search/preferences', { params: { type: result.type, id: result.id } }),
}

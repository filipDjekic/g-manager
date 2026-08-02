export interface ApiError {
  timestamp: string
  status: number
  error: string
  message: string
  path: string
  requestId: string
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

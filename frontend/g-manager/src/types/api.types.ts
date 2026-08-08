export interface ApiError {
  timestamp: string
  status: number
  error: string
  message: string
  path: string
  requestId: string
  code?: string
  fieldErrors?: ApiFieldError[]
}

export interface ApiFieldError {
  field: string
  message: string
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

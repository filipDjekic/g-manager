import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../auth/authStore'
import type { ApiError } from '../types/api.types'
import type { AuthResponse } from '../types/auth.types'
import { userFacingApiError } from './errorMessage'
import { observeRequestId } from '../observability/errorReporter'
import { cacheRead, readCached } from '../pwa/clientStorage'
import { useFeatureStore } from '../feature/featureStore'
import type { FeatureFlagState } from '../types/feature.types'

const baseURL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const publicClient = axios.create({ baseURL, withCredentials: true })
export const apiClient = axios.create({ baseURL, withCredentials: true })

let refreshPromise: Promise<string | null> | null = null
const OFFLINE_READ_PATHS = ['/catalog', '/working-hours', '/reports/definitions']
const offlineKey = (url = '', params: unknown) => `${url}?${JSON.stringify(params ?? {})}`
const canCache = (url = '') => OFFLINE_READ_PATHS.some((path) => url === path || url.startsWith(`${path}?`))

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = publicClient
      .post<AuthResponse>('/auth/refresh')
      .then(({ data }) => {
        useAuthStore.getState().setSession(data.token, data.user)
        return data.token
      })
      .catch(() => {
        useAuthStore.getState().clearSession()
        return null
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

interface RetryableRequest extends InternalAxiosRequestConfig {
  _authRetry?: boolean
}

apiClient.interceptors.response.use(
  (response) => {
    observeRequestId(response.headers['x-request-id'])
    const userId = useAuthStore.getState().user?.id
    if (userId && response.config.method === 'get' && canCache(response.config.url)) {
      void cacheRead(userId, offlineKey(response.config.url, response.config.params), response.data).catch(() => undefined)
    }
    return response
  },
  async (error: AxiosError<ApiError>) => {
    observeRequestId(error.response?.headers['x-request-id'] ?? error.response?.data?.requestId)
    const request = error.config as RetryableRequest | undefined
    const userId = useAuthStore.getState().user?.id
    if (!error.response && userId && request?.method === 'get' && canCache(request.url)) {
      const cached = await readCached<unknown>(userId, offlineKey(request.url, request.params)).catch(() => null)
      if (cached) {
        window.dispatchEvent(new CustomEvent('gmanager:stale-read', { detail: cached.updatedAt }))
        return { data: cached.value, status: 200, statusText: 'Offline cache', headers: { 'x-gmanager-stale': 'true' }, config: request }
      }
    }
    if (error.response?.status === 401 && request && !request._authRetry) {
      request._authRetry = true
      const token = await refreshAccessToken()
      if (token) {
        request.headers.Authorization = `Bearer ${token}`
        return apiClient(request)
      }
    }
    return Promise.reject(error)
  },
)

publicClient.interceptors.response.use(
  (response) => {
    observeRequestId(response.headers['x-request-id'])
    return response
  },
  (error: AxiosError<ApiError>) => {
    observeRequestId(error.response?.headers['x-request-id'] ?? error.response?.data?.requestId)
    return Promise.reject(error)
  },
)

export async function initializeSession(): Promise<void> {
  const token = await refreshAccessToken()
  if (token) {
    await apiClient.get<FeatureFlagState[]>('/features/bootstrap')
      .then(({ data }) => useFeatureStore.getState().apply(data))
      .catch(() => useFeatureStore.getState().reset())
  }
  useAuthStore.getState().finishInitialization()
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiError>(error)) {
    return userFacingApiError(
      error.response?.status,
      error.response?.data?.message,
      error.response?.data?.requestId,
      fallback,
    )
  }
  return fallback
}

export function apiErrorDetails(error: unknown): ApiError | undefined {
  return axios.isAxiosError<ApiError>(error) ? error.response?.data : undefined
}

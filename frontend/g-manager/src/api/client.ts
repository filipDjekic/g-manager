import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../auth/authStore'
import type { ApiError } from '../types/api.types'
import type { AuthResponse } from '../types/auth.types'
import { userFacingApiError } from './errorMessage'

const baseURL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const publicClient = axios.create({ baseURL, withCredentials: true })
export const apiClient = axios.create({ baseURL, withCredentials: true })

let refreshPromise: Promise<string | null> | null = null

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
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const request = error.config as RetryableRequest | undefined
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

export async function initializeSession(): Promise<void> {
  await refreshAccessToken()
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

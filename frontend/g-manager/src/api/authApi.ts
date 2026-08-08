import { publicClient } from './client'
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  RegistrationResponse,
  SessionInfo,
  SecurityEventInfo,
} from '../types/auth.types'
import { apiClient } from './client'

export const authApi = {
  async login(request: LoginRequest): Promise<AuthResponse> {
    const { data } = await publicClient.post<AuthResponse>('/auth/login', request)
    return data
  },
  async register(request: RegisterRequest): Promise<RegistrationResponse> {
    const { data } = await publicClient.post<RegistrationResponse>('/auth/register', request)
    return data
  },
  async logout(): Promise<void> {
    await publicClient.post('/auth/logout')
  },
  async sessions(): Promise<SessionInfo[]> {
    const { data } = await apiClient.get<SessionInfo[]>('/auth/sessions')
    return data
  },
  async securityEvents(): Promise<SecurityEventInfo[]> {
    const { data } = await apiClient.get<SecurityEventInfo[]>('/auth/security-events')
    return data
  },
  async revokeSession(id: string): Promise<void> {
    await apiClient.delete(`/auth/sessions/${id}`)
  },
  async revokeAllSessions(): Promise<void> {
    await apiClient.delete('/auth/sessions')
  },
}

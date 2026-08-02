import { publicClient } from './client'
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  RegistrationResponse,
} from '../types/auth.types'

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
}

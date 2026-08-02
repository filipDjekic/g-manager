export type Role = 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  avatarUrl?: string | null
}

export interface AuthResponse {
  token: string
  expiresAt: string
  user: AuthUser
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export interface RegistrationResponse {
  id: string
  name: string
  email: string
  role: 'CUSTOMER'
}

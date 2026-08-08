import type { Permission, Role } from './auth.types'

export interface UserResponse {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
  version: number
  permissions: Permission[]
}

export interface CreateUserRequest {
  name: string
  email: string
  password: string
  role: 'ADMIN' | 'EMPLOYEE'
}

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
  deletedAt: string | null
  deletedBy: string | null
  deletionReason: string | null
}

export interface CreateUserRequest {
  name: string
  email: string
  password: string
  role: 'ADMIN' | 'EMPLOYEE'
}

export interface UserStatistics {
  total: number
  active: number
  administrators: number
  inactive: number
}

export interface EmployeeStatistics {
  total: number; active: number; newThisMonth: number; inactive: number; onLeave: number | null
  businessDate: string; businessZone: string
}

export interface EmployeeAssignments {
  locations: Array<{ id: string; name: string; code: string; active: boolean; version: number }>
  resources: Array<{ id: string; name: string; code: string; type: string; areaId: string; areaName: string
    locationId: string; locationName: string; active: boolean; version: number }>
}

export interface EmployeeLeave {
  id: string; startsAt: string; endsAt: string; status: 'APPROVED'
}

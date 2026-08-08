import type { AuthUser, Permission, Role } from '../types/auth.types'

const profile: Permission[] = [
  'PROFILE_READ', 'PROFILE_UPDATE', 'CATALOG_READ', 'WORKING_HOURS_READ', 'EMPLOYEE_LIST',
]

export const roleCapabilities: Record<Role, Permission[]> = {
  CUSTOMER: [...profile, 'RESERVATION_CREATE', 'RESERVATION_READ_OWN',
    'RESERVATION_CHANGE_STATUS', 'ORDER_CREATE', 'ORDER_READ_OWN', 'ORDER_CHANGE_STATUS'],
  EMPLOYEE: [...profile, 'RESERVATION_READ_ALL', 'RESERVATION_CHANGE_STATUS',
    'ORDER_READ_ALL', 'ORDER_CHANGE_STATUS', 'DASHBOARD_OPERATIONAL'],
  ADMIN: [...profile, 'USER_LIST', 'USER_CREATE', 'USER_DEACTIVATE', 'CATALOG_MANAGE',
    'WORKING_HOURS_MANAGE', 'RESERVATION_READ_ALL', 'RESERVATION_CHANGE_STATUS',
    'ORDER_READ_ALL', 'ORDER_CHANGE_STATUS', 'DASHBOARD_SUMMARY',
    'DASHBOARD_OPERATIONAL', 'METRICS_READ'],
  OWNER: [...profile, 'USER_LIST', 'USER_CREATE', 'USER_DEACTIVATE', 'CATALOG_MANAGE',
    'WORKING_HOURS_MANAGE', 'RESERVATION_READ_ALL', 'RESERVATION_CHANGE_STATUS',
    'ORDER_READ_ALL', 'ORDER_CHANGE_STATUS', 'DASHBOARD_SUMMARY',
    'DASHBOARD_OPERATIONAL', 'METRICS_READ'],
}

export function hasCapability(user: AuthUser | null | undefined, permission: Permission): boolean {
  return !!user && (user.permissions ?? roleCapabilities[user.role]).includes(permission)
}

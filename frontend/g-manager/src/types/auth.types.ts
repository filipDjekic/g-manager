export type Role = 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER'
export type Permission =
  | 'PROFILE_READ' | 'PROFILE_UPDATE' | 'EMPLOYEE_LIST'
  | 'USER_LIST' | 'USER_CREATE' | 'USER_DEACTIVATE'
  | 'USER_DELETE' | 'USER_RESTORE' | 'CUSTOMER_READ' | 'CUSTOMER_CREATE'
  | 'CUSTOMER_UPDATE_LIMITED' | 'CUSTOMER_DEACTIVATE' | 'CUSTOMER_CRM_MANAGE'
  | 'CATALOG_READ' | 'CATALOG_MANAGE' | 'CATALOG_DELETE' | 'CATALOG_RESTORE'
  | 'AUDIT_READ'
  | 'WORKING_HOURS_READ' | 'WORKING_HOURS_MANAGE'
  | 'RESOURCE_READ' | 'RESOURCE_MANAGE'
  | 'STATION_READ' | 'STATION_MAINTENANCE' | 'APPLICATION_PROFILE_MANAGE'
  | 'RESERVATION_CREATE' | 'RESERVATION_READ_OWN' | 'RESERVATION_READ_ALL'
  | 'RESERVATION_CHANGE_STATUS'
  | 'ORDER_CREATE' | 'ORDER_READ_OWN' | 'ORDER_READ_ALL' | 'ORDER_CHANGE_STATUS'
  | 'DASHBOARD_SUMMARY' | 'DASHBOARD_OPERATIONAL' | 'METRICS_READ'
  | 'REPORT_READ' | 'REPORT_MANAGE'
  | 'WORKFLOW_SUBMIT' | 'WORKFLOW_ACT' | 'WORKFLOW_MANAGE'
  | 'FEATURE_FLAG_MANAGE'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  avatarUrl?: string | null
  permissions?: Permission[]
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

export interface ActivateCustomerRequest {
  activationSecret: string
  password: string
}

export interface SessionInfo {
  id: string
  deviceLabel: string
  userAgentSummary: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  current: boolean
}

export type SecurityEventType =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'TOKEN_REFRESH' | 'TOKEN_REUSE'
  | 'SESSION_REVOKED' | 'ALL_SESSIONS_REVOKED' | 'LOGOUT'

export interface SecurityEventInfo {
  type: SecurityEventType
  deviceLabel: string
  occurredAt: string
}

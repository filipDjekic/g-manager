import type { NavigationAction } from '../api/searchApi'
export type NotificationType = 'SECURITY_SESSION_STARTED' | 'SECURITY_PASSWORD_CHANGED' | 'RESERVATION_CREATED' | 'RESERVATION_STATUS_CHANGED' | 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'REPORT_COMPLETED' | 'WAITLIST_OFFERED' | 'WAITLIST_CANCELLED'
// Read compatibility for persisted notifications from the retired module.
type RetiredNotificationType = 'WORKFLOW_ACTION_REQUIRED' | 'WORKFLOW_REMINDER' | 'WORKFLOW_ESCALATED' | 'WORKFLOW_COMPLETED'
export interface AppNotification { id: string; type: NotificationType | RetiredNotificationType; priority: 'LOW' | 'NORMAL' | 'HIGH'; title: string; body: string; read: boolean; createdAt: string; action: NavigationAction | null }
export interface NotificationPage { notifications: AppNotification[]; unreadCount: number; page: number; size: number; totalElements: number; totalPages: number }
export interface NotificationPreference { type: NotificationType; mandatory: boolean; inAppEnabled: boolean; emailEnabled: boolean }

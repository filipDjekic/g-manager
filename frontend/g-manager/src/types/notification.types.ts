export type NotificationType = 'SECURITY_SESSION_STARTED' | 'SECURITY_PASSWORD_CHANGED' | 'RESERVATION_CREATED' | 'RESERVATION_STATUS_CHANGED' | 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'REPORT_COMPLETED' | 'WORKFLOW_ACTION_REQUIRED' | 'WORKFLOW_REMINDER' | 'WORKFLOW_ESCALATED' | 'WORKFLOW_COMPLETED'
export interface AppNotification { id: string; type: NotificationType; priority: 'LOW' | 'NORMAL' | 'HIGH'; title: string; body: string; read: boolean; createdAt: string }
export interface NotificationPage { notifications: AppNotification[]; unreadCount: number }
export interface NotificationPreference { type: NotificationType; mandatory: boolean; inAppEnabled: boolean; emailEnabled: boolean }

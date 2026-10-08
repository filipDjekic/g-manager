import { apiClient } from './client'
import { connectAuthenticatedStream, consumeSse } from './sse'
import type { AppNotification, NotificationPage, NotificationPreference } from '../types/notification.types'
import type { NavigationAction } from './searchApi'

export const notificationApi = {
  list: () => apiClient.get<NotificationPage>('/notifications').then(({ data }) => data),
  read: (id: string) => apiClient.patch<AppNotification>(`/notifications/${id}/read`).then(({ data }) => data),
  readAll: () => apiClient.patch('/notifications/read-all'),
  open: (id: string) => apiClient.get<{ action: NavigationAction }>(`/notifications/${id}/open`).then(({ data }) => data),
  preferences: () => apiClient.get<NotificationPreference[]>('/notifications/preferences').then(({ data }) => data),
  savePreference: (value: NotificationPreference) => apiClient.put<NotificationPreference>('/notifications/preferences', value).then(({ data }) => data),
}

export function connectNotificationStream(
  onNotification: (value: AppNotification) => void,
  onState: (state: 'connected' | 'reconnecting' | 'offline') => void,
) {
  return connectAuthenticatedStream('/notifications/stream',
    () => onState('connected'),
    () => onState(navigator.onLine ? 'reconnecting' : 'offline'),
    (stream, signal) => consumeSse(stream, 'notification', (id, data) => {
      if (id) localStorage.setItem('gmanager.notification.last-event-id', id)
      onNotification(JSON.parse(data) as AppNotification)
    }, signal),
    (): Record<string, string> => {
      const lastId = localStorage.getItem('gmanager.notification.last-event-id')
      return lastId ? { 'Last-Event-ID': lastId } : {}
    })
}
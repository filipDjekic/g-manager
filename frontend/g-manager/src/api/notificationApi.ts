import { apiClient } from './client'
import { useAuthStore } from '../auth/authStore'
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
  const controller = new AbortController()
  let retries = 0
  async function run() {
    while (!controller.signal.aborted) {
      if (!navigator.onLine) { onState('offline'); await delay(3000); continue }
      try {
        const token = useAuthStore.getState().accessToken
        const lastId = localStorage.getItem('gmanager.notification.last-event-id')
        const response = await fetch(`${import.meta.env.VITE_API_URL ?? '/api/v1'}/notifications/stream`, {
          headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(lastId ? { 'Last-Event-ID': lastId } : {}) },
          credentials: 'include', signal: controller.signal,
        })
        if (response.status === 401) { await notificationApi.list(); throw new Error('SSE authorization refresh') }
        if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`)
        retries = 0; onState('connected'); await consume(response.body, (id, value) => {
          localStorage.setItem('gmanager.notification.last-event-id', id); onNotification(value)
        })
      } catch {
        if (controller.signal.aborted) break
        retries += 1; onState(navigator.onLine ? 'reconnecting' : 'offline')
        await delay(Math.min(30000, 1000 * 2 ** Math.min(retries, 5)))
      }
    }
  }
  void run()
  return () => controller.abort()
}

async function consume(stream: ReadableStream<Uint8Array>, emit: (id: string, value: AppNotification) => void) {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = ''
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2)
      const id = block.split('\n').find((line) => line.startsWith('id:'))?.slice(3).trim()
      const event = block.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim()
      const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
      if (id && event === 'notification' && data) emit(id, JSON.parse(data) as AppNotification)
      boundary = buffer.indexOf('\n\n')
    }
  }
}
function delay(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)) }

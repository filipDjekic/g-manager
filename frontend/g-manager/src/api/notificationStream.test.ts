import { waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { connectNotificationStream } from './notificationApi'

describe('notification SSE stream', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })
  it('parses an event, persists its replay cursor and sends no token in the URL', async () => {
    useAuthStore.setState({ accessToken: 'safe-token' })
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('id: event-1\nevent: notification\ndata: {"id":"event-1","type":"ORDER_CREATED","priority":"NORMAL","title":"Nova","body":"Telo","read":false,"createdAt":"2026-08-10T10:00:00Z"}\n\n'))
      controller.close()
    } })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock); const received = vi.fn(); const state = vi.fn()
    const disconnect = connectNotificationStream(received, state)
    await waitFor(() => expect(received).toHaveBeenCalledOnce()); disconnect()
    expect(localStorage.getItem('gmanager.notification.last-event-id')).toBe('event-1')
    expect(fetchMock.mock.calls[0][0]).not.toContain('safe-token')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer safe-token')
  })
})

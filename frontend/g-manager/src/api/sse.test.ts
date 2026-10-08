import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { configureErrorTransport } from '../observability/errorReporter'
import { connectAuthenticatedStream, consumeSse } from './sse'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ refreshAccessToken: refresh }))

describe('authenticated SSE lifecycle', () => {
  const stops: Array<() => void> = []
  beforeEach(() => {
    vi.useFakeTimers()
    refresh.mockReset()
    useAuthStore.setState({ accessToken: 'old-token', user: null })
  })
  afterEach(async () => {
    stops.splice(0).forEach((stop) => stop())
    await vi.advanceTimersByTimeAsync(0)
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function start(path = '/notifications/stream') {
    const connected = vi.fn()
    const retry = vi.fn()
    stops.push(connectAuthenticatedStream(path, connected, retry,
      (body, signal) => consumeSse(body, 'notification', vi.fn(), signal)))
    return { connected, retry }
  }

  const closedResponse = () => new Response(new ReadableStream({ start(controller) { controller.close() } }),
    { headers: { 'Content-Type': 'text/event-stream' } })

  it.each(['/notifications/stream', '/gaming-sessions/stream'])('backs off after clean EOF on %s', async (path) => {
    const fetchMock = vi.fn().mockImplementation(closedResponse)
    vi.stubGlobal('fetch', fetchMock)
    start(path)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).not.toContain('old-token')
  })

  it('refreshes once after 401 and sends the replacement token in the header', async () => {
    refresh.mockImplementation(async () => { useAuthStore.setState({ accessToken: 'new-token' }); return 'new-token' })
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockImplementation(closedResponse)
    vi.stubGlobal('fetch', fetchMock)
    const { connected } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token')
    expect(connected).toHaveBeenCalledTimes(1)
  })

  it('stops after another 401 following refresh', async () => {
    refresh.mockImplementation(async () => { useAuthStore.setState({ accessToken: 'new-token' }); return 'new-token' })
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 401 })))
    vi.stubGlobal('fetch', fetchMock)
    start()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('stops on 403 without refreshing or logging out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    start()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(useAuthStore.getState().accessToken).toBe('old-token')
  })

  it('retries network failures and cancels an offline wait on disconnect', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Network unavailable')).mockImplementation(closedResponse)
    vi.stubGlobal('fetch', fetchMock)
    const { connected } = start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(connected).toHaveBeenCalledTimes(1)
    stops[0]()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('closes the active reader immediately on logout', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream({ cancel })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream,
      { headers: { 'Content-Type': 'text/event-stream' } })))
    start()
    await vi.advanceTimersByTimeAsync(0)
    useAuthStore.getState().clearSession()
    await vi.advanceTimersByTimeAsync(0)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(stream.locked).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports callback failures without treating them as network retries or logging payloads', async () => {
    const reports = vi.fn()
    const restore = configureErrorTransport(reports)
    try {
      const body = new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('event: notification\ndata: {}\n\n'))
        controller.close()
      } })
      const fetchMock = vi.fn().mockResolvedValue(new Response(body,
        { headers: { 'Content-Type': 'text/event-stream' } }))
      vi.stubGlobal('fetch', fetchMock)
      stops.push(connectAuthenticatedStream('/notifications/stream', vi.fn(), vi.fn(),
        (stream, signal) => consumeSse(stream, 'notification', () => {
          throw new TypeError('private-payload')
        }, signal)))
      await vi.advanceTimersByTimeAsync(60000)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(reports).toHaveBeenCalledOnce()
      expect(reports.mock.calls[0][0].message).toContain('TypeError')
      expect(reports.mock.calls[0][0].message).not.toContain('private-payload')
    } finally { restore() }
  })
  it('parses CRLF split across chunks and releases the reader', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('id: event-1\r'))
        controller.enqueue(new TextEncoder().encode('\nevent: notification\r\ndata: {"id":"event-1"}\r\n\r'))
        controller.enqueue(new TextEncoder().encode('\n'))
        controller.close()
      },
    })
    const emit = vi.fn()
    await consumeSse(stream, 'notification', emit)
    expect(emit).toHaveBeenCalledExactlyOnceWith('event-1', '{"id":"event-1"}')
    expect(stream.locked).toBe(false)
  })
})
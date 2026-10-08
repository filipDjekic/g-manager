import axios from 'axios'
import { useAuthStore } from '../auth/authStore'
import { refreshAccessToken } from './client'
import { reportFrontendError } from '../observability/errorReporter'

class StreamUnavailable extends Error {}

export function connectAuthenticatedStream(
  path: string,
  onConnected: () => void,
  onRetry: () => void,
  consume: (stream: ReadableStream<Uint8Array>, signal: AbortSignal) => Promise<void>,
  extraHeaders: () => Record<string, string> = () => ({}),
) {
  const controller = new AbortController()
  const owner = useAuthStore.getState().user?.id
  const unsubscribe = useAuthStore.subscribe((state) => {
    if (!state.accessToken || state.user?.id !== owner) controller.abort()
  })
  const stop = () => { controller.abort(); unsubscribe() }
  async function run() {
    let attempt = 0
    let authRetried = false
    try {
      while (!controller.signal.aborted && useAuthStore.getState().accessToken) {
        try {
          if (!navigator.onLine) throw new StreamUnavailable('Offline')
          const token = useAuthStore.getState().accessToken
          const response = await fetch(`${import.meta.env.VITE_API_URL ?? '/api/v1'}${path}`, {
            headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}`, ...extraHeaders() },
            credentials: 'include', signal: controller.signal,
          })
          if (controller.signal.aborted) { await response.body?.cancel(); break }
          if (response.status === 403) {
            await response.body?.cancel()
            onRetry()
            break
          }
          if (response.status === 401) {
            await response.body?.cancel()
            if (authRetried) { useAuthStore.getState().clearSession(); onRetry(); break }
            const current = useAuthStore.getState().accessToken
            const refreshed = current !== token ? current : await refreshAccessToken()
            if (controller.signal.aborted || !useAuthStore.getState().accessToken) { onRetry(); break }
            if (refreshed) { authRetried = true; continue }
            throw new StreamUnavailable('Authentication refresh unavailable')
          }
          if (!response.ok || !response.body ||
              !response.headers.get('content-type')?.includes('text/event-stream')) {
            await response.body?.cancel()
            throw new StreamUnavailable('SSE response unavailable')
          }
          attempt = 0
          authRetried = false
          onConnected()
          await consume(response.body, controller.signal)
        } catch (error) {
          if (controller.signal.aborted || axios.isCancel(error)) break
          if (!(error instanceof StreamUnavailable || error instanceof TypeError ||
              error instanceof DOMException && ['AbortError', 'NetworkError'].includes(error.name))) {
            reportFrontendError(error, 'SSE event processing')
            break
          }
        }
        if (controller.signal.aborted) break
        onRetry()
        attempt += 1
        await delay(Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)), controller.signal)
      }
    } finally { unsubscribe() }
  }
  void run()
  return stop
}

export async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  eventName: string,
  emit: (id: string | undefined, data: string) => void,
  signal?: AbortSignal,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const abort = () => { void reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      // Normalize the accumulated buffer so CRLF split across chunks is also handled.
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const lines = buffer.slice(0, boundary).split('\n')
        buffer = buffer.slice(boundary + 2)
        const id = lines.find((line) => line.startsWith('id:'))?.slice(3).trim()
        const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
        const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (event === eventName && data) {
          try { emit(id, data) }
          catch (error) {
            // Callback failures are programming/payload errors, not a reason to retry the network.
            const type = error instanceof Error ? error.name : 'UnknownError'
            throw new Error(`SSE event processing failed (${type})`, { cause: error })
          }
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => { window.clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
    const timer = window.setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    if (signal.aborted) done()
  })
}
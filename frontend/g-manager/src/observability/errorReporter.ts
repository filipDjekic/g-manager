export interface FrontendErrorEvent {
  type: 'frontend_error'
  message: string
  source: string
  release: string
  requestId?: string
}

export type ErrorTransport = (event: FrontendErrorEvent) => void

const secretPattern = /(password|secret|token|authorization|cookie)(\s*[=:]\s*)([^\s,;]+)/gi
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

let lastRequestId: string | undefined
let transport: ErrorTransport = (event) => {
  if (import.meta.env.DEV) console.error('frontend_error', event)
}

function sanitize(value: string): string {
  return value
    .replace(secretPattern, '$1$2[REDACTED]')
    .replace(bearerPattern, 'Bearer [REDACTED]')
    .replace(emailPattern, '[REDACTED_EMAIL]')
    .slice(0, 500)
}

export function observeRequestId(value: unknown): void {
  if (typeof value === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(value)) lastRequestId = value
}

export function configureErrorTransport(nextTransport: ErrorTransport): () => void {
  const previous = transport
  transport = nextTransport
  return () => { transport = previous }
}

export function reportFrontendError(error: unknown, source: string): void {
  const message = error instanceof Error ? error.message : String(error)
  transport({
    type: 'frontend_error',
    message: sanitize(message),
    source: sanitize(source),
    release: import.meta.env.VITE_RELEASE ?? 'development',
    requestId: lastRequestId,
  })
}

export function installGlobalErrorReporting(): () => void {
  const onError = (event: ErrorEvent) => reportFrontendError(event.error ?? event.message, 'window.error')
  const onRejection = (event: PromiseRejectionEvent) => reportFrontendError(event.reason, 'window.unhandledrejection')
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

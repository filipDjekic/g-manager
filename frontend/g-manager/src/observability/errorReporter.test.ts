import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  configureErrorTransport,
  observeRequestId,
  reportFrontendError,
  type FrontendErrorEvent,
} from './errorReporter'

let restoreTransport: (() => void) | undefined

afterEach(() => restoreTransport?.())

describe('frontend error reporter', () => {
  it('correlates an error and redacts secrets and personal data', () => {
    const events: FrontendErrorEvent[] = []
    restoreTransport = configureErrorTransport((event) => events.push(event))
    observeRequestId('request-13')

    reportFrontendError(
      new Error('Bearer abc.def.ghi password=hidden customer@example.com'),
      'react',
    )

    expect(events).toEqual([expect.objectContaining({
      type: 'frontend_error',
      requestId: 'request-13',
      source: 'react',
    })])
    expect(events[0].message).not.toContain('abc.def.ghi')
    expect(events[0].message).not.toContain('hidden')
    expect(events[0].message).not.toContain('customer@example.com')
    expect(events[0]).not.toHaveProperty('stack')
  })

  it('ignores an unsafe request identifier', () => {
    const reporter = vi.fn()
    restoreTransport = configureErrorTransport(reporter)
    observeRequestId('request id containing spaces')
    reportFrontendError('safe', 'window.error')

    expect(reporter).toHaveBeenCalledWith(expect.not.objectContaining({
      requestId: 'request id containing spaces',
    }))
  })
})

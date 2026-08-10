import { afterEach, describe, expect, it, vi } from 'vitest'
import { configurePerformanceTransport, reportWebVital } from './performanceReporter'

let restore: (() => void) | undefined

afterEach(() => restore?.())

describe('performance reporter', () => {
  it('reports a bounded web-vital event without page or user data', () => {
    const reporter = vi.fn()
    restore = configurePerformanceTransport(reporter)

    reportWebVital('LCP', 1234.56789)

    expect(reporter).toHaveBeenCalledWith(expect.objectContaining({
      type: 'web_vital', name: 'LCP', value: 1234.568,
    }))
    expect(reporter.mock.calls[0][0]).not.toHaveProperty('url')
    expect(reporter.mock.calls[0][0]).not.toHaveProperty('user')
  })

  it('ignores invalid values', () => {
    const reporter = vi.fn()
    restore = configurePerformanceTransport(reporter)
    reportWebVital('CLS', Number.NaN)
    expect(reporter).not.toHaveBeenCalled()
  })
})

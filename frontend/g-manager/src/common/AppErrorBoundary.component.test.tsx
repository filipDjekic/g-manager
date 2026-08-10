import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'
import { configureErrorTransport } from '../observability/errorReporter'

function BrokenComponent(): never {
  throw new Error('synthetic render failure')
}

describe('AppErrorBoundary', () => {
  it('renders children and a safe fallback for an unexpected render failure', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reporter = vi.fn()
    const restoreReporter = configureErrorTransport(reporter)
    const view = render(<AppErrorBoundary><p>Ready</p></AppErrorBoundary>)
    expect(screen.getByText('Ready')).toBeInTheDocument()

    view.rerender(<AppErrorBoundary><BrokenComponent /></AppErrorBoundary>)
    expect(screen.getByRole('heading')).toHaveTextContent(/Aplikacija trenutno nije dostupna/)
    expect(screen.queryByText('synthetic render failure')).not.toBeInTheDocument()
    expect(reporter).toHaveBeenCalledWith(expect.objectContaining({
      source: 'react.error-boundary',
    }))
    restoreReporter()
    consoleError.mockRestore()
  })
})

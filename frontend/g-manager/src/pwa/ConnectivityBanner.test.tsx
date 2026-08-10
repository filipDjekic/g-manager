import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectivityBanner } from './ConnectivityBanner'

describe('ConnectivityBanner', () => {
  it('clearly marks offline mode and never reports a successful mutation', () => {
    render(<ConnectivityBanner />)
    fireEvent(window, new Event('offline'))
    expect(screen.getByRole('status')).toHaveTextContent('Offline režim')
    expect(screen.getByRole('status')).toHaveTextContent('Slanje izmena nije dostupno')
  })

  it('labels an explicitly stale read cache', () => {
    render(<ConnectivityBanner />)
    fireEvent(window, new CustomEvent('gmanager:stale-read', { detail: Date.UTC(2026, 0, 1) }))
    expect(screen.getByRole('status')).toHaveTextContent('lokalnog read-only cache-a')
  })
})

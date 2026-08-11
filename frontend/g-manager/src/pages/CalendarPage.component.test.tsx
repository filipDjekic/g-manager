import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import { dateInBusinessZone } from '../reservations/dateTime'
import { CalendarPage } from './CalendarPage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><CalendarPage /></MemoryRouter></QueryClientProvider>)
}

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-29T08:00:00Z'))
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'owner-token', isInitializing: false })
  })
  afterEach(() => vi.useRealTimers())

  it('renders repository events in business time and navigates bounded ranges', async () => {
    const ranges: string[] = []
    server.use(
      http.get('/api/v1/users/employees', () => HttpResponse.json({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })),
      http.get('/api/v1/reservations/calendar', ({ request }) => {
        const url = new URL(request.url); ranges.push(`${url.searchParams.get('from')}:${url.searchParams.get('to')}`)
        return HttpResponse.json([{
          id: 'reservation-1', employeeId: 'employee-1', employeeName: 'Ana', customerName: 'Mila',
          serviceName: 'Tretman', startTime: '2026-03-29T01:30:00Z', endTime: '2026-03-29T02:30:00Z', status: 'CONFIRMED',
        }])
      }),
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    expect(await screen.findByRole('button', { name: /03:30 Tretman, Mila, Potvrđeno/ })).toBeVisible()
    expect(ranges[0]).toBe('2026-03-23:2026-03-29')
    await user.click(screen.getByRole('button', { name: 'Sledeće' }))
    await waitFor(() => expect(ranges).toContain('2026-03-30:2026-04-05'))
    await user.click(screen.getByRole('button', { name: 'Mesec' }))
    await waitFor(() => expect(ranges).toContain('2026-03-30:2026-05-10'))
  })

  it('keeps DST instants on their business calendar date', () => {
    expect(dateInBusinessZone('2026-03-29T00:30:00Z')).toBe('2026-03-29')
    expect(dateInBusinessZone('2026-10-25T01:30:00Z')).toBe('2026-10-25')
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import { DashboardPage } from './DashboardPage'

describe('DashboardPage', () => {
  beforeEach(() => useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'owner-token', isInitializing: false }))

  it('renders defined metrics, accessible table fallbacks and scoped drill-downs', async () => {
    server.use(
      http.get('/api/v1/dashboard/trends', () => HttpResponse.json({
        from: '2026-08-01', to: '2026-08-10', previousFrom: '2026-07-22', previousTo: '2026-07-31',
        timezone: 'Europe/Belgrade', grain: 'DAY',
        revenue: { current: 300, previous: 100, absoluteChange: 200, percentChange: 200 },
        completedOrders: { current: 2, previous: 1, absoluteChange: 1, percentChange: 100 },
        reservations: { current: 3, previous: 2, absoluteChange: 1, percentChange: 50 },
        reservationsByStatus: { PENDING: 1, CONFIRMED: 2, REJECTED: 0, CANCELLED: 0, COMPLETED: 0 },
        buckets: [{ date: '2026-08-10', completedRevenue: 300, completedOrders: 2, reservations: 3 }],
      })),
      http.get('/api/v1/dashboard/workload', () => HttpResponse.json({ from: '2026-08-01', to: '2026-08-10', timezone: 'Europe/Belgrade',
        capacityDefinition: 'CONFIRMED + COMPLETED reservation minutes / configured business minutes',
        employees: [{ employeeId: 'employee-1', employeeName: 'Ana', reservationCount: 2, reservedMinutes: 120, capacityMinutes: 480, utilizationPercent: 25 }],
      })),
      http.get('/api/v1/dashboard/widget-preferences', () => HttpResponse.json([])),
    )
    const { container } = render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Dnevni poslovni trendovi' })).toBeVisible()
    expect(screen.getByRole('table', { name: /Dnevni prihod/ })).toHaveTextContent('300')
    expect(screen.getByRole('link', { name: 'Otvori PENDING rezervacije' })).toHaveAttribute('href', expect.stringContaining('status=PENDING'))
    expect(screen.getByRole('table', { name: /Potvrđeni i završeni/ })).toHaveTextContent('Ana')
    await waitFor(async () => expect((await axe(container)).violations
      .filter(({ impact }) => impact === 'serious' || impact === 'critical')).toHaveLength(0))
  })
})

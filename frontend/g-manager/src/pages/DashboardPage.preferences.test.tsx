import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import type { DashboardWidgetPreference } from '../types/dashboard.types'
import { DashboardPage } from './DashboardPage'

const trends = { from: '2028-03-01', to: '2028-03-16', previousFrom: '2028-02-14', previousTo: '2028-02-29', timezone: 'Europe/Belgrade', grain: 'DAY', revenue: { current: 100, previous: 200, absoluteChange: -100, percentChange: -50 }, reservations: { current: 2, previous: 2, absoluteChange: 0, percentChange: 0 }, completedOrders: { current: 1, previous: 0, absoluteChange: 1, percentChange: null }, reservationsByStatus: { PENDING: 0, CONFIRMED: 2, REJECTED: 0, CANCELLED: 0, COMPLETED: 0 }, buckets: [] }
const workload = { from: trends.from, to: trends.to, timezone: trends.timezone, capacityDefinition: 'Reserved minutes / capacity', employees: [{ employeeId: 'employee-1', employeeName: 'Eva', reservationCount: 2, reservedMinutes: 120, capacityMinutes: 0, utilizationPercent: null }] }
function page() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>) }
describe('dashboard preferences and range validation', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('ADMIN'), accessToken: 'token', isInitializing: false })
    server.use(http.get('/api/v1/dashboard/attention', () => HttpResponse.json({ date: '2028-03-16', timezone: trends.timezone, workloadThresholdPercent: 80, items: [] })),
      http.get('/api/v1/dashboard/trends', () => HttpResponse.json(trends)),
      http.get('/api/v1/dashboard/workload', () => HttpResponse.json(workload)),
      http.get('/api/v1/dashboard/widget-preferences', () => HttpResponse.json([])))
  })

  it('validates alert thresholds and persists a reordered, hidden widget layout', async () => {
    let saved: DashboardWidgetPreference[] | undefined
    server.use(http.put('/api/v1/dashboard/widget-preferences', async ({ request }) => { saved = await request.json() as DashboardWidgetPreference[]; return HttpResponse.json(saved) }))
    page(); const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'Analitika' }))
    await screen.findByRole('option', { name: 'Eva' })
    await user.click(screen.getByText('Prilagodi dashboard', { selector: 'summary' }))
    fireEvent.change(screen.getByLabelText('Prag %'), { target: { value: '101' } })
    await user.click(screen.getByRole('button', { name: 'Sačuvaj raspored' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Prag upozorenja mora biti između 0 i 100.')
    expect(saved).toBeUndefined()
    fireEvent.change(screen.getByLabelText('Prag %'), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Pomeri Trendovi dole' }))
    await user.click(screen.getByRole('button', { name: 'Pomeri Opterećenje zaposlenih gore' }))
    for (const label of ['Trendovi', 'Statusi rezervacija', 'Opterećenje zaposlenih']) await user.click(screen.getByRole('checkbox', { name: label }))
    expect(screen.getByText('Svi widgeti su sakriveni')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Sačuvaj raspored' }))
    await waitFor(() => expect(saved).toEqual([
      { widgetKey: 'statuses', position: 0, visible: false, threshold: null },
      { widgetKey: 'workload', position: 1, visible: false, threshold: null },
      { widgetKey: 'trends', position: 2, visible: false, threshold: null },
    ]))
  })

  it('rejects reversed dates before querying and carries employee scope to refreshed results', async () => {
    const scopes: URLSearchParams[] = []
    server.use(http.get('/api/v1/dashboard/workload', ({ request }) => { scopes.push(new URL(request.url).searchParams); return HttpResponse.json(workload) }))
    page(); const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'Analitika' }))
    await screen.findByRole('option', { name: 'Eva' })
    fireEvent.change(screen.getByLabelText('Od'), { target: { value: '2028-03-20' } })
    fireEvent.change(screen.getByLabelText('Do'), { target: { value: '2028-03-16' } })
    const count = scopes.length
    await user.click(screen.getByRole('button', { name: 'Primeni' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Početni datum ne sme biti posle završnog.')
    expect(scopes).toHaveLength(count)
    fireEvent.change(screen.getByLabelText('Od'), { target: { value: '2028-03-01' } })
    await user.selectOptions(screen.getByLabelText('Zaposleni'), 'employee-1')
    await user.click(screen.getByRole('button', { name: 'Primeni' }))
    await waitFor(() => expect(scopes.at(-1)?.get('employeeId')).toBe('employee-1'))
    expect(scopes.at(-1)?.get('from')).toBe('2028-03-01')
    expect(scopes.at(-1)?.get('to')).toBe('2028-03-16')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('retries failed initial data without losing the operational overview', async () => {
    let calls = 0
    server.use(http.get('/api/v1/dashboard/attention', () => ++calls === 1 ? HttpResponse.error() : HttpResponse.json({ date: '2028-03-16', timezone: trends.timezone, workloadThresholdPercent: 80, items: [] })))
    page(); const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await screen.findByText('Nema operativnih upozorenja')).toBeVisible()
  })
})

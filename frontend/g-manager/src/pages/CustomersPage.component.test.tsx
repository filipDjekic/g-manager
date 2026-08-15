import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { CustomersPage } from './CustomersPage'

function renderPage(initialEntry = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><CustomersPage /></MemoryRouter></QueryClientProvider>)
}

describe('CustomersPage', () => {
  it('shows reliable KPIs and opens readable customer history', async () => {
    let crmNotes: Array<Record<string, unknown>> = []
    server.use(
      http.get('/api/v1/customers/customer-1/crm', () => HttpResponse.json({ customerId: 'customer-1', version: 0, notes: crmNotes, tags: ['VIP'] })),
      http.post('/api/v1/customers/customer-1/crm/notes', async ({ request }) => { const body = await request.json() as { body: string }; crmNotes = [{ id: 'note-1', body: body.body, createdBy: 'owner-1', createdAt: '2026-08-11T08:00:00Z', updatedAt: '2026-08-11T08:00:00Z', expiresAt: '2028-08-11T08:00:00Z', version: 0 }]; return HttpResponse.json(crmNotes[0], { status: 201 }) }),
      http.get('/api/v1/saved-views', () => HttpResponse.json([])),
      http.get('/api/v1/customers', () => HttpResponse.json({ content: [{ id: 'customer-1', name: 'Mila Jović', email: 'mila@example.test',
        active: true, registeredAt: '2026-01-01T10:00:00Z', version: 0, reservationCount: 2, completedAppointmentCount: 1,
        orderCount: 2, completedOrderCount: 1, completedOrderRevenue: 1200, lastActivityAt: '2026-08-10T08:00:00Z' }],
      page: 0, size: 20, totalElements: 1, totalPages: 1 })),
      http.get('/api/v1/customers/customer-1', () => HttpResponse.json({ customer: { id: 'customer-1', name: 'Mila Jović', email: 'mila@example.test',
        active: true, registeredAt: '2026-01-01T10:00:00Z', version: 0, reservationCount: 2, completedAppointmentCount: 1,
        orderCount: 2, completedOrderCount: 1, completedOrderRevenue: 1200, lastActivityAt: '2026-08-10T08:00:00Z' },
      reservations: [{ id: 'reservation-1', serviceName: 'Masaža', startTime: '2026-08-10T08:00:00Z', endTime: '2026-08-10T09:00:00Z', status: 'COMPLETED' }],
      orders: [{ id: 'order-1', status: 'COMPLETED', totalPrice: 1200, createdAt: '2026-08-09T08:00:00Z' }] })),
    )
    const { container } = renderPage()
    expect(await screen.findByText('Mila Jović')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Lista klijenata' })).toHaveTextContent('1.200')
    const detailsButton = screen.getByRole('button', { name: 'Detalji' })
    expect(container.querySelector('.responsive-table td[data-label="Klijent"]')).toBeTruthy()
    await userEvent.click(detailsButton)
    expect(screen.getByRole('button', { name: 'Zatvori' })).toHaveFocus()
    expect(await screen.findByRole('button', { name: /VIP/ })).toBeVisible()
    await userEvent.type(screen.getByLabelText('Nova beleška'), 'Pozvati pre termina')
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj belešku' }))
    expect(await screen.findByText('Pozvati pre termina')).toBeVisible()
    expect(await screen.findByRole('dialog', { name: 'Mila Jović' })).toHaveTextContent('Masaža')
    expect(screen.getByRole('dialog')).toHaveTextContent('COMPLETED')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(detailsButton).toHaveFocus())
    expect((await axe(container)).violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toHaveLength(0)
  })

  it('renders a customer with no history without invented data', async () => {
    server.use(http.get('/api/v1/customers/customer-empty/crm', () => HttpResponse.json({ customerId: 'customer-empty', version: 0, notes: [], tags: [] })), http.get('/api/v1/saved-views', () => HttpResponse.json([])), http.get('/api/v1/customers', () => HttpResponse.json({ content: [{ id: 'customer-empty', name: 'Novi klijent', email: 'novi@example.test',
      active: true, registeredAt: '2026-08-11T08:00:00Z', version: 0, reservationCount: 0, completedAppointmentCount: 0,
      orderCount: 0, completedOrderCount: 0, completedOrderRevenue: 0, lastActivityAt: null }], page: 0, size: 20, totalElements: 1, totalPages: 1 })),
    http.get('/api/v1/customers/customer-empty', () => HttpResponse.json({ customer: { id: 'customer-empty', name: 'Novi klijent', email: 'novi@example.test',
      active: true, registeredAt: '2026-08-11T08:00:00Z', version: 0, reservationCount: 0, completedAppointmentCount: 0,
      orderCount: 0, completedOrderCount: 0, completedOrderRevenue: 0, lastActivityAt: null }, reservations: [], orders: [] })))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Detalji' }))
    expect(await screen.findByText('Nema istorije termina.')).toBeVisible()
    expect(screen.getByText('Nema istorije narudžbina.')).toBeVisible()
  })
})

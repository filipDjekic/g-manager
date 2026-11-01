import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import { CustomersPage } from './CustomersPage'

const customer = { id: 'customer-1', name: 'Ada', email: 'ada@example.test', active: true, registeredAt: '2028-01-01T10:00:00Z', reservationCount: 0, completedAppointmentCount: 0, orderCount: 0, completedOrderCount: 0, completedOrderRevenue: 0, lastActivityAt: null, version: 3 }
function page() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><CustomersPage /></MemoryRouter></QueryClientProvider>) }
async function menu(action: string) {
  const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Akcije za klijenta Ada' })); await user.click(await screen.findByRole('menuitem', { name: action }))
}
describe('customer management actions', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false })
    server.use(http.get('/api/v1/saved-views', () => HttpResponse.json([])), http.get('/api/v1/customers', () => HttpResponse.json({ content: [customer], totalElements: 1, totalPages: 1 })))
  })

  it('edits customer data through the keyboard menu and confirms deactivation with a recoverable server rejection', async () => {
    let active = true, attempts = 0
    server.use(http.get('/api/v1/customers', () => HttpResponse.json({ content: [{ ...customer, active }], totalElements: 1, totalPages: 1 })),
      http.patch('/api/v1/customers/customer-1', async ({ request }) => { expect(await request.json()).toMatchObject({ name: 'Ada Updated', version: 3 }); return HttpResponse.json(customer) }),
      http.post('/api/v1/customers/customer-1/deactivate', () => { if (++attempts === 1) return HttpResponse.json({ message: 'Concurrent account change' }, { status: 409 }); active = false; return new HttpResponse(null, { status: 204 }) }))
    page(); const user = userEvent.setup()
    const trigger = await screen.findByRole('button', { name: 'Akcije za klijenta Ada' })
    await user.click(trigger)
    await user.keyboard('{End}{Home}{ArrowDown}{ArrowUp}{Escape}')
    expect(trigger).toHaveFocus()
    await menu('Izmeni podatke')
    fireEvent.change(screen.getByLabelText('Ime i prezime'), { target: { value: 'Ada Updated' } })
    await user.click(screen.getByRole('button', { name: 'Sačuvaj podatke' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await menu('Deaktiviraj klijenta')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deaktiviraj' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Concurrent account change')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deaktiviraj' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Neaktivan')).toBeVisible()
    await user.click(trigger)
    expect(screen.queryByRole('menuitem', { name: 'Deaktiviraj klijenta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Pokreni gaming sesiju' })).not.toBeInTheDocument()
  }, 15000)

  it('rechecks active gaming visits when starting and handles a concurrent session instead of opening a second start', async () => {
    let reads = 0
    server.use(http.get('/api/v1/gaming-sessions/customer/customer-1', () => HttpResponse.json(++reads === 1 ? [] : [{ id: 'session-1', status: 'ACTIVE' }])))
    page(); await screen.findByText('Ada')
    await menu('Pokreni gaming sesiju')
    expect(await screen.findByRole('alert')).toHaveTextContent('Klijent već ima aktivnu gaming sesiju.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reads).toBe(2)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Akcije za klijenta Ada' }))
    expect(await screen.findByText('Gaming sesija je već aktivna.')).toBeVisible()
  })

  it('resets empty filters and denies list access without customer-read permission', async () => {
    const queries: URLSearchParams[] = []
    server.use(http.get('/api/v1/customers', ({ request }) => { queries.push(new URL(request.url).searchParams); return HttpResponse.json({ content: [], totalElements: 0, totalPages: 0 }) }))
    page(); const user = userEvent.setup()
    await screen.findByText('Nema klijenata')
    await user.selectOptions(screen.getByLabelText('Status'), 'false')
    await user.type(screen.getByLabelText('Pretraga klijenata'), 'missing')
    await waitFor(() => expect(queries.at(-1)?.get('search')).toBe('missing'))
    await user.click(screen.getByRole('button', { name: 'Resetuj filtere' }))
    expect(screen.getByLabelText('Status')).toHaveValue('')
    expect(screen.getByLabelText('Pretraga klijenata')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Novi klijent' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Otkaži' }))
    const count = queries.length
    useAuthStore.setState({ user: authUser('CUSTOMER', { permissions: [] }) })
    expect(await screen.findByText('Pregled klijenata nije dostupan')).toBeVisible()
    expect(queries).toHaveLength(count)
  })
})

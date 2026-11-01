import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { testArea, testLocation } from '../test/resourceFixtures'
import { server } from '../test/server'
import { CalendarPage } from './CalendarPage'

function Location() { const value = useLocation(); return <output aria-label="URL">{value.search}</output> }
describe('calendar scope and filter transitions', () => {
  beforeEach(() => useAuthStore.setState({ user: authUser('EMPLOYEE'), accessToken: 'token', isInitializing: false }))

  it('clears an unauthorized station when returning to own scope and composes customer, resource and time filters', async () => {
    const queries: URLSearchParams[] = []
    const customer = { id: 'customer-1', name: 'Ada', email: 'ada@example.test', active: true }
    server.use(
      http.get('/api/v1/users/employees', () => HttpResponse.json({ content: [{ id: 'employee-1', name: 'Eva' }] })),
      http.get('/api/v1/resources/locations', () => HttpResponse.json([testLocation])),
      http.get('/api/v1/resources/locations/loc-1/areas', () => HttpResponse.json([testArea])),
      http.get('/api/v1/resources/management-scope', () => HttpResponse.json({ allResources: false, resourceIds: ['pc-1'] })),
      http.get('/api/v1/resources/reservation-filters', () => HttpResponse.json(['pc-1', 'pc-2'].map(id => ({ id, name: id, code: id, serviceId: 'service-1', type: 'GAMING_PC', locationId: 'loc-1', areaId: 'area-1', areaName: 'PC room' })))),
      http.get('/api/v1/reservations/calendar', ({ request }) => { queries.push(new URL(request.url).searchParams); return HttpResponse.json([]) }),
      http.get('/api/v1/customers', () => HttpResponse.json({ content: [customer], totalElements: 1, totalPages: 1 })),
      http.get('/api/v1/customers/customer-1', () => HttpResponse.json({ customer })),
      http.get('/api/v1/catalog', () => HttpResponse.json({ content: [], totalPages: 0 })),
    )
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/calendar?view=list&date=2028-03-16']}><Location /><CalendarPage /></MemoryRouter></QueryClientProvider>)
    const user = userEvent.setup()
    await screen.findByText('Nema rezervacija u periodu')
    await user.click(screen.getByText('Filteri rasporeda', { exact: true }))
    await user.click(screen.getByRole('button', { name: 'Sve stanice' }))
    await screen.findByRole('option', { name: /pc-2/ })
    await user.selectOptions(screen.getByLabelText('Gaming stanica / resurs'), 'pc-2')
    await user.click(screen.getByRole('button', { name: 'Moje stanice' }))
    expect(screen.getByLabelText('Gaming stanica / resurs')).toHaveValue('')
    expect(screen.queryByRole('option', { name: /pc-2/ })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Lokal'), 'loc-1')
    await screen.findByRole('option', { name: 'PC room' })
    await user.selectOptions(screen.getByLabelText('Zona'), 'area-1')
    await user.selectOptions(screen.getByLabelText('Gaming stanica / resurs'), 'pc-1')
    await user.selectOptions(screen.getByLabelText('Zaposleni'), 'employee-1')
    await user.selectOptions(screen.getByLabelText('Status'), 'CONFIRMED')
    await user.click(screen.getByRole('button', { name: 'Više filtera' }))
    await user.click(screen.getByRole('button', { name: 'Izaberi klijenta' }))
    const picker = screen.getByRole('dialog', { name: 'Izbor klijenta' })
    await user.click(await within(picker).findByRole('button', { name: 'Izaberi klijenta Ada' }))
    await waitFor(() => expect(queries.at(-1)?.get('customerId')).toBe('customer-1'))
    for (const [key, value] of Object.entries({ scope: 'MANAGEABLE', locationId: 'loc-1', areaId: 'area-1', resourceId: 'pc-1', employeeId: 'employee-1', status: 'CONFIRMED' })) expect(queries.at(-1)?.get(key)).toBe(value)
    await user.click(screen.getByRole('button', { name: 'Promeni klijenta: Ada' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Svi klijenti' }))
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('customerId=')
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2028-03-17' } })
    await user.click(screen.getByRole('button', { name: 'Prethodni period' }))
    await waitFor(() => expect(screen.getByLabelText('Datum')).toHaveValue('2028-03-10'))
    await user.click(screen.getByText('Pomoćni kalendar, legenda i prečice', { exact: true }))
    await user.click(screen.getByRole('button', { name: 'Sledeći mesec' }))
    await user.click(screen.getByRole('button', { name: 'Prethodni mesec' }))
    await user.click(screen.getByRole('button', { name: '+ Nova rezervacija' }))
    expect(screen.getByRole('dialog', { name: 'Nova rezervacija' })).toBeVisible()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Otkaži' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 15000)
})

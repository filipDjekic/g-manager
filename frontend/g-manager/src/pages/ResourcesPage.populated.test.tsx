import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { testArea, testGeometry, testLocation, testMapResource, testResource } from '../test/resourceFixtures'
import { server } from '../test/server'
import { ResourcesPage } from './ResourcesPage'

function Location() { const location = useLocation(); return <output aria-label="URL">{location.pathname + location.search}</output> }
function page(path = '/resources?view=list') {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Location /><ResourcesPage /></MemoryRouter></QueryClientProvider>)
}
async function menu(label: string, action: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: label }))
  await user.click(screen.getByRole('menuitem', { name: action }))
}

describe('populated resource workspace', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false })
    server.use(
      http.get('/api/v1/resources/locations', () => HttpResponse.json([testLocation, { ...testLocation, id: 'closed', name: 'Closed location', active: false }])),
      http.get('/api/v1/resources/locations/:id/areas', ({ params }) => HttpResponse.json([{ ...testArea, locationId: params.id }])),
      http.get('/api/v1/resources/areas/area-1', () => HttpResponse.json([testResource()])),
      http.get('/api/v1/resources/areas/area-1/availability', () => HttpResponse.json([testMapResource()])),
      http.get('/api/v1/resources/locations/:id/floor-plan', ({ params }) => HttpResponse.json({ locationId: params.id, version: 1, geometry: testGeometry })),
      http.get('/api/v1/catalog', () => HttpResponse.json({ content: [{ id: 'service-1', name: 'Game hour' }], totalPages: 1 })),
      http.get('/api/v1/users/employees', () => HttpResponse.json({ content: [{ id: 'employee-1', name: 'Eva', email: 'eva@example.test' }] })),
      http.get('/api/v1/resources/pc-1/employees', () => HttpResponse.json([])),
      http.get('/api/v1/resources/locations/loc-1/employees', () => HttpResponse.json([])),
    )
  })

  it('opens each contextual editor and keeps location, zone and detail selection in the URL', async () => {
    page(); const user = userEvent.setup()
    await screen.findByRole('button', { name: 'Akcije · Gaming PC 01' })
    await menu('Akcije · Gaming PC 01', 'Detalji')
    const detail = await screen.findByRole('dialog', { name: 'Gaming PC 01' })
    expect(await within(detail).findByText('Game hour')).toBeVisible()
    expect(within(detail).getByText('Dozvoljeno')).toBeVisible()
    expect(screen.getByLabelText('URL')).toHaveTextContent('resourceId=pc-1')
    await user.click(within(detail).getByRole('button', { name: 'Zatvori' }))
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('resourceId=')
    for (const action of ['Nova lokacija', 'Uredi lokaciju', 'Nova zona', 'Uredi zonu', 'Novi resurs']) {
      await menu('Upravljanje prostorom', action)
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByLabelText('Naziv')).toBeVisible()
      await user.click(within(dialog).getByRole('button', { name: 'Zatvori' }))
    }
    await menu('Akcije · Gaming PC 01', 'Podesi resurs')
    expect(screen.getByRole('dialog', { name: 'Izmeni resurs' })).toBeVisible()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Zatvori' }))
    await user.selectOptions(screen.getByLabelText('Zona'), 'all')
    expect(screen.getByLabelText('URL')).toHaveTextContent('areaId=all')
    await user.selectOptions(screen.getByLabelText('Lokal'), 'closed')
    expect(screen.getByLabelText('URL')).toHaveTextContent('locationId=closed')
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('areaId=')
  }, 15000)

  it('shows the same availability on the map and the list and recovers from a failed availability request', async () => {
    let calls = 0
    server.use(http.get('/api/v1/resources/areas/area-1/availability', () => ++calls === 1 ? HttpResponse.json({ message: 'Availability unavailable' }, { status: 503 }) : HttpResponse.json([testMapResource()])))
    page(); const user = userEvent.setup()
    expect(await screen.findByText('Mapu i dostupnost nije moguće učitati.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    await screen.findByRole('button', { name: 'Akcije · Gaming PC 01' })
    await user.click(screen.getByRole('button', { name: 'Mapa' }))
    expect(await screen.findByRole('group', { name: /^Mapa prostora/ })).toBeVisible()
    fireEvent.keyDown(screen.getByRole('button', { name: /Gaming PC 01.*Slobodan/ }), { key: 'Enter' })
    expect(await screen.findByRole('dialog', { name: 'Gaming PC 01' })).toBeVisible()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Zatvori' }))
    await user.click(screen.getByRole('button', { name: 'Lista' }))
    expect(await screen.findByRole('table')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Početak intervala'), { target: { value: '' } })
    expect(screen.getByText('Unesite validan datum i vreme za proveru dostupnosti.')).toBeVisible()
  })

  it('offers customers only active locations and the permitted reservation handoff', async () => {
    useAuthStore.setState({ user: authUser('CUSTOMER') })
    page(); const user = userEvent.setup()
    await screen.findByRole('button', { name: 'Akcije · Gaming PC 01' })
    expect(screen.queryByRole('option', { name: /Closed location/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upravljanje prostorom' })).not.toBeInTheDocument()
    await menu('Akcije · Gaming PC 01', 'Detalji')
    expect(screen.queryByRole('button', { name: 'Podesi resurs' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zakaži termin' }))
    await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/my-reservations?serviceId=service-1&resourceId=pc-1'))
  })

  it('can assign location and station access and updates the acknowledged assignments', async () => {
    let locationAssigned = false, resourceAssigned = false
    server.use(
      http.get('/api/v1/resources/locations/loc-1/employees', () => HttpResponse.json(locationAssigned ? [{ employeeId: 'employee-1', active: true, version: 1 }] : [])),
      http.put('/api/v1/resources/locations/loc-1/employees/employee-1', async ({ request }) => { expect(await request.json()).toEqual({ active: true }); locationAssigned = true; return HttpResponse.json({}) }),
      http.get('/api/v1/resources/pc-1/employees', () => HttpResponse.json(resourceAssigned ? [{ employeeId: 'employee-1', employeeName: 'Eva', employeeActive: true, active: true, version: 1 }] : [])),
      http.put('/api/v1/resources/pc-1/employees/employee-1', async ({ request }) => { expect(await request.json()).toEqual({ active: true }); resourceAssigned = true; return HttpResponse.json({}) }),
    )
    page(); const user = userEvent.setup()
    await screen.findByRole('button', { name: 'Akcije · Gaming PC 01' })
    await user.click(screen.getByRole('button', { name: 'Zaposleni na lokaciji' }))
    await user.click(await screen.findByRole('button', { name: 'Dodeli lokaciju' }))
    expect(await screen.findByText('Dodeljena lokacija')).toBeVisible()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Zatvori' }))
    await menu('Akcije · Gaming PC 01', 'Zaposleni na resursu')
    await user.click(await screen.findByRole('button', { name: 'Dodeli stanicu' }))
    expect(await screen.findByText('Dodeljena stanica')).toBeVisible()
    expect(locationAssigned && resourceAssigned).toBe(true)
  })
})

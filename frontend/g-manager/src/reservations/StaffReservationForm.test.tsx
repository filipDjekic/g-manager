import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { testArea, testLocation } from '../test/resourceFixtures'
import { server } from '../test/server'
import { StaffReservationForm } from './StaffReservationForm'

const start = '2028-03-16T10:00:00Z', end = '2028-03-16T11:00:00Z'
const client = { id: 'client-1', name: 'Ada Customer', email: 'ada@example.test', active: true }
const service = { id: 'service-1', name: 'Game hour', type: 'SERVICE', active: true, durationMinutes: 60 }
const bookingResource = { id: 'pc-1', serviceId: service.id, name: 'First PC', code: 'PC-01', type: 'GAMING_PC', locationId: testLocation.id, areaId: testArea.id, available: true }
const rules = { resourceRequired: false, resources: [], variableDuration: false, minimumDurationMinutes: 60, maximumDurationMinutes: 60, defaultDurationMinutes: 60 }
const plan = { timezone: 'Europe/Belgrade', serverTime: '2028-03-15T10:00:00Z', date: '2028-03-16', startTime: start, endTime: end, available: true, reason: null, resourceId: null, employeeId: 'employee-1', alternatives: [], intervals: [] }
const occurrence = { startTime: start, endTime: end, available: true, reason: null, resourceId: 'pc-1' }

function form(resource = false) {
  const onCreated = vi.fn(), onClose = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <StaffReservationForm onCreated={onCreated} onClose={onClose} initial={{ startTime: start, employeeId: 'employee-1', ...(resource ? { locationId: testLocation.id, areaId: testArea.id } : {}) }} />
  </QueryClientProvider>)
  return { onCreated, onClose }
}
async function choose() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Izaberi klijenta' }))
  const picker = screen.getByRole('dialog', { name: 'Izaberi klijenta' })
  await user.click(await within(picker).findByRole('button', { name: 'Izaberi klijenta Ada Customer' }))
  await screen.findByRole('option', { name: /Game hour/ })
  await user.selectOptions(screen.getByLabelText('Usluga'), service.id)
  return user
}

describe('staff booking transactions', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'test-token', isInitializing: false })
    server.use(
      http.get('/api/v1/catalog', () => HttpResponse.json({ content: [service], totalPages: 1 })),
      http.get('/api/v1/customers', () => HttpResponse.json({ content: [client], totalPages: 1 })),
      http.get('/api/v1/customers/client-1', () => HttpResponse.json({ customer: client })),
      http.get('/api/v1/users/employees', () => HttpResponse.json({ content: [{ id: 'employee-1', name: 'Eva' }] })),
      http.get('/api/v1/resources/locations', () => HttpResponse.json([testLocation])),
      http.get('/api/v1/resources/locations/loc-1/areas', () => HttpResponse.json([testArea])),
      http.get('/api/v1/resources/booking-options', () => HttpResponse.json(rules)),
      http.get('/api/v1/reservations/booking-plan', () => HttpResponse.json(plan)),
    )
  })

  it('creates a fixed-duration reservation once and sends the chosen customer and note', async () => {
    const requests: Array<{ key: string | null; body: unknown }> = []
    server.use(http.post('/api/v1/reservations', async ({ request }) => {
      requests.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() })
      await delay(60)
      return HttpResponse.json({ id: 'created-1' })
    }))
    const { onCreated } = form(), user = await choose()
    expect(screen.getByLabelText('Datum završetka')).toBeDisabled()
    await user.type(screen.getByLabelText('Napomena'), 'Near the entrance')
    const submit = screen.getByRole('button', { name: 'Kreiraj rezervaciju' })
    await waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit); fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('created-1', 'Rezervacija je kreirana.'))
    expect(requests).toHaveLength(1)
    expect(requests[0].key).toBeTruthy()
    expect(requests[0].body).toMatchObject({ customerId: client.id, serviceId: service.id, employeeId: 'employee-1', startTime: start, durationMinutes: 60, note: 'Near the entrance' })
  })

  it('validates a variable interval, shows occupancy and applies an available alternative', async () => {
    const plans: URL[] = []
    server.use(http.get('/api/v1/resources/booking-options', () => HttpResponse.json({ ...rules, resourceRequired: true, variableDuration: true, minimumDurationMinutes: 30, maximumDurationMinutes: 180, resources: [bookingResource] })),
      http.get('/api/v1/reservations/booking-plan', ({ request }) => {
        const url = new URL(request.url); plans.push(url)
        return HttpResponse.json({ ...plan, resourceId: 'pc-1', available: url.searchParams.get('start')?.includes('12:00') ?? false,
          reason: 'Resource has a reservation at this time', intervals: [{ startTime: start, endTime: end, status: 'OCCUPIED' }],
          alternatives: [{ startTime: '2028-03-16T12:00:00Z', endTime: '2028-03-16T13:00:00Z', resourceId: 'pc-1', employeeId: 'employee-1' }] })
      }))
    form(true); const user = await choose()
    await screen.findByRole('option', { name: /PC-01/ })
    await waitFor(() => expect(screen.getByLabelText('Gaming računar / PlayStation / drugi resurs')).toBeEnabled())
    await user.selectOptions(screen.getByLabelText('Gaming računar / PlayStation / drugi resurs'), 'pc-1')
    expect(await screen.findByRole('heading', { name: 'Zauzetost resursa za izabrani dan' })).toBeVisible()
    expect(screen.getByText('Zauzeto')).toBeVisible()
    const alternative = within((await screen.findByText('Dostupne alternative za isto trajanje:')).parentElement!).getByRole('button')
    await user.click(alternative)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kreiraj rezervaciju' })).toBeEnabled())
    expect(plans.at(-1)?.searchParams.get('durationMinutes')).toBe('60')
    expect(plans.at(-1)?.searchParams.get('resourceId')).toBe('pc-1')
    fireEvent.change(screen.getByLabelText('Datum završetka'), { target: { value: '2028-03-15' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Vreme završetka mora biti posle početka')
    expect(screen.getByRole('button', { name: 'Kreiraj rezervaciju' })).toBeDisabled()
  })

  it('freezes an uncertain request and retries the exact body and idempotency key', async () => {
    const requests: Array<{ key: string | null; body: unknown }> = []
    server.use(http.post('/api/v1/reservations', async ({ request }) => {
      requests.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() })
      return requests.length === 1 ? HttpResponse.error() : HttpResponse.json({ id: 'recovered' })
    }))
    const { onCreated } = form(), user = await choose()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kreiraj rezervaciju' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Kreiraj rezervaciju' }))
    const retry = await screen.findByRole('button', { name: 'Ponovi isti zahtev' })
    expect(screen.getByLabelText('Usluga')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Otkaži' })).toBeDisabled()
    await waitFor(() => expect(retry).toBeEnabled())
    await user.click(retry)
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('recovered', expect.any(String)))
    expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0])
  })

  it('requires a recurrence review, respects conflict policy and reports skipped bookings', async () => {
    const conflict = { ...occurrence, startTime: '2028-03-23T10:00:00Z', endTime: '2028-03-23T11:00:00Z', available: false, reason: 'Resource has a reservation at this time' }
    let submitted: unknown
    server.use(http.post('/api/v1/reservations/recurrence/preview', () => HttpResponse.json({ timezone: 'Europe/Belgrade', occurrences: [occurrence, conflict] })),
      http.post('/api/v1/reservations/recurrence', async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json({ seriesId: 'series-1', created: [{ id: 'first', startTime: start, endTime: end }], skipped: [conflict] })
      }))
    const { onCreated } = form(), user = await choose()
    await user.click(screen.getByText('Ponavljanje i napredne opcije', { selector: 'summary' }))
    await user.click(screen.getByLabelText('Ponavljajuća rezervacija'))
    expect(await screen.findByText('Serija neće biti kreirana dok svi termini ne budu dostupni.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Pregled serije' })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Konflikti'), 'SKIP_CONFLICTS')
    await user.selectOptions(screen.getByLabelText('Učestalost'), 'MONTHLY')
    fireEvent.change(screen.getByLabelText('Interval'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Broj termina'), { target: { value: '3' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pregled serije' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Pregled serije' }))
    expect(screen.getByRole('heading', { name: 'Pregled pre kreiranja' })).toBeVisible()
    expect(submitted).toBeUndefined()
    await user.click(screen.getByRole('button', { name: 'Izmeni podatke' }))
    await user.click(screen.getByRole('button', { name: 'Pregled serije' }))
    await user.click(screen.getByRole('button', { name: 'Kreiraj rezervaciju' }))
    expect(await screen.findByRole('heading', { name: 'Rezultat serije' })).toBeVisible()
    expect(onCreated).not.toHaveBeenCalled()
    expect(submitted).toMatchObject({ frequency: 'MONTHLY', interval: 2, occurrences: 3, conflictPolicy: 'SKIP_CONFLICTS' })
    await user.click(screen.getByRole('button', { name: 'Otvori kreiranu rezervaciju' }))
    expect(onCreated).toHaveBeenCalledWith('first', 'Kreirano 1, preskočeno 1 termina.')
  })

  it.each([
    { role: 'EMPLOYEE' as const, required: false, assigned: false, allowed: true },
    { role: 'OWNER' as const, required: false, assigned: false, allowed: false },
    { role: 'EMPLOYEE' as const, required: true, assigned: false, allowed: false },
    { role: 'EMPLOYEE' as const, required: true, assigned: true, allowed: true },
  ])('enforces management scope for $role (resource required: $required, assigned: $assigned)', async ({ role, required, assigned, allowed }) => {
    useAuthStore.setState({ user: authUser(role, { id: 'employee-1' }) })
    server.use(http.get('/api/v1/resources/management-scope', () => HttpResponse.json({ allResources: false, resourceIds: assigned ? ['pc-1'] : [] })),
      http.get('/api/v1/resources/booking-options', () => HttpResponse.json({ ...rules, resourceRequired: required, resources: required ? [bookingResource] : [] })),
      http.get('/api/v1/reservations/booking-plan', () => HttpResponse.json({ ...plan, resourceId: required ? 'pc-1' : null })))
    form(required); await choose()
    await screen.findByText('Izabrani period je dostupan. Pre čuvanja će biti ponovo proveren.')
    await waitFor(() => {
      const submit = screen.getByRole('button', { name: 'Kreiraj rezervaciju' })
      if (allowed) expect(submit).toBeEnabled(); else expect(submit).toBeDisabled()
    })
  })

  it('blocks an inactive customer and allows a safe close only after confirming unsaved fields', async () => {
    server.use(http.get('/api/v1/customers/client-1', () => HttpResponse.json({ customer: { ...client, active: false } })))
    const { onClose } = form(), user = await choose()
    await screen.findByText('Izabrani period je dostupan. Pre čuvanja će biti ponovo proveren.')
    expect(screen.getByRole('button', { name: 'Kreiraj rezervaciju' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Otkaži' }))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Odbaci unose' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

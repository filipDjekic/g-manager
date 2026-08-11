import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { MyReservationsPage } from './MyReservationsPage'

const emptyPage = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }
const service = { id: 'service-1', name: 'Masaža', description: null, type: 'SERVICE', price: 1000,
  durationMinutes: 60, active: true, imageUrl: null, createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', version: 0, deletedAt: null, deletedBy: null, deletionReason: null }
const employee = { id: 'employee-1', name: 'Ana', email: 'ana@example.test', role: 'EMPLOYEE', active: true,
  avatarUrl: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', version: 0 }

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><MyReservationsPage /></MemoryRouter></QueryClientProvider>)
}

function baseHandlers() {
  return [
    http.get('/api/v1/reservations/me', () => HttpResponse.json(emptyPage)),
    http.get('/api/v1/catalog', () => HttpResponse.json({ ...emptyPage, size: 100, content: [service], totalElements: 1, totalPages: 1 })),
    http.get('/api/v1/users/employees', () => HttpResponse.json({ ...emptyPage, size: 100, content: [employee], totalElements: 1, totalPages: 1 })),
    http.get('/api/v1/waitlist/me', () => HttpResponse.json([])),
  ]
}

async function selectDate(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText('Usluga'), 'service-1')
  await user.selectOptions(screen.getByLabelText('Zaposleni'), 'ANY')
  await user.type(screen.getByLabelText('Datum'), '2028-03-16')
}

describe('MyReservationsPage slot booking', () => {
  it('shows loading/error and retries availability before keyboard review', async () => {
    const user = userEvent.setup()
    let calls = 0
    server.use(...baseHandlers(), http.get('/api/v1/availability', async () => {
      calls += 1
      await delay(50)
      if (calls === 1) return HttpResponse.json({ message: 'Unavailable' }, { status: 503 })
      return HttpResponse.json({ timezone: 'Europe/Belgrade', serviceId: 'service-1', serviceName: 'Masaža',
        durationMinutes: 60, slotIncrementMinutes: 15, from: '2028-03-16', to: '2028-03-16',
        employees: [{ employeeId: 'employee-1', employeeName: 'Ana',
          slots: [{ startTime: '2028-03-16T10:00:00Z', endTime: '2028-03-16T11:00:00Z' }] }] })
    }))
    renderPage()
    await selectDate(user)

    expect(await screen.findByLabelText('Učitavanje dostupnih termina')).toBeVisible()
    expect(await screen.findByText('Dostupne termine nije moguće učitati.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    const slot = await screen.findByRole('radio')
    slot.focus()
    await user.keyboard(' ')
    expect(slot).toBeChecked()
    expect(screen.getByRole('heading', { name: 'Proverite termin' })).toBeVisible()
    expect(screen.getByText('Bilo koji slobodan zaposleni')).toBeVisible()
  })

  it('renders an actionable empty state when the selected day has no slots', async () => {
    const user = userEvent.setup()
    let joined = false
    server.use(...baseHandlers(), http.get('/api/v1/availability', () => HttpResponse.json({
      timezone: 'Europe/Belgrade', serviceId: 'service-1', serviceName: 'Masaža', durationMinutes: 60,
      slotIncrementMinutes: 15, from: '2028-03-16', to: '2028-03-16', employees: [{
        employeeId: 'employee-1', employeeName: 'Ana', slots: [],
      }],
    })), http.post('/api/v1/waitlist', async ({ request }) => {
      const body = await request.json() as { employeeId: string }
      joined = body.employeeId === 'employee-1'
      return HttpResponse.json({ id: 'wait-1', serviceId: 'service-1', employeeId: 'employee-1',
        desiredStart: '2028-03-16T09:00:00Z', status: 'WAITING', offerId: null,
        offerExpiresAt: null, reservationId: null, version: 0 }, { status: 201 })
    }))
    renderPage()
    await user.selectOptions(await screen.findByLabelText('Usluga'), 'service-1')
    await user.selectOptions(screen.getByLabelText('Zaposleni'), 'employee-1')
    await user.type(screen.getByLabelText('Datum'), '2028-03-16')
    expect(await screen.findByRole('heading', { name: 'Nema slobodnih termina' })).toBeVisible()
    expect(screen.getByText(/prijavite za konkretan termin/)).toBeVisible()
    await user.type(screen.getByLabelText('Željeno vreme'), '10:00')
    await user.click(screen.getByRole('button', { name: 'Prijavi se na listu čekanja' }))
    await waitFor(() => expect(joined).toBe(true))
    expect(await screen.findByText('Dodati ste na listu čekanja za izabrani termin.')).toBeVisible()
  })

  it('requires a bounded preview before creating a recurring series', async () => {
    const user = userEvent.setup()
    let idempotencyKey = ''
    server.use(...baseHandlers(), http.get('/api/v1/availability', () => HttpResponse.json({
      timezone: 'Europe/Belgrade', serviceId: 'service-1', serviceName: 'Masaža', durationMinutes: 60,
      slotIncrementMinutes: 15, from: '2028-03-16', to: '2028-03-16', employees: [{
        employeeId: 'employee-1', employeeName: 'Ana',
        slots: [{ startTime: '2028-03-16T09:00:00Z', endTime: '2028-03-16T10:00:00Z' }],
      }],
    })), http.post('/api/v1/reservations/recurrence/preview', () => HttpResponse.json({
      timezone: 'Europe/Belgrade', occurrences: [
        { startTime: '2028-03-16T09:00:00Z', endTime: '2028-03-16T10:00:00Z', available: true, reason: null },
        { startTime: '2028-03-23T09:00:00Z', endTime: '2028-03-23T10:00:00Z', available: false, reason: 'Zauzeto' },
      ],
    })), http.post('/api/v1/reservations/recurrence', ({ request }) => {
      idempotencyKey = request.headers.get('Idempotency-Key') ?? ''
      return HttpResponse.json({ seriesId: 'series-1', created: [{ id: 'reservation-1' }], skipped: [{}] }, { status: 201 })
    }))
    renderPage()
    await user.selectOptions(await screen.findByLabelText('Usluga'), 'service-1')
    await user.selectOptions(screen.getByLabelText('Zaposleni'), 'employee-1')
    await user.type(screen.getByLabelText('Datum'), '2028-03-16')
    await user.click(await screen.findByRole('radio'))
    await user.click(screen.getByLabelText('Ponavljajući termini'))
    expect(screen.getByRole('button', { name: 'Kreiraj seriju' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Pregledaj ponavljanje' }))
    expect(await screen.findByText(/Konflikt: Zauzeto/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Kreiraj seriju' }))
    await waitFor(() => expect(idempotencyKey).not.toBe(''))
    expect(await screen.findByText(/Kreirano rezervacija: 1; preskočeno: 1/)).toBeVisible()
  })
})

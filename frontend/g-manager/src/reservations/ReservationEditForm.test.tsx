import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import type { ReservationDetail } from '../types/reservation.types'
import { ReservationEditForm } from './ReservationEditForm'

const value: ReservationDetail = { id: 'reservation-1', customerName: 'Ada', customerContact: null, employeeName: 'Eva', serviceName: 'Game hour', durationMinutes: 60, startTime: '2028-03-16T10:00:00Z', endTime: '2028-03-16T11:00:00Z', status: 'CONFIRMED', note: null, createdAt: '2028-03-01T10:00:00Z', updatedAt: '2028-03-01T10:00:00Z', version: 3, allowedActions: [], history: [], resourceId: 'pc-1', resourceRequired: true }
const options = { resources: [{ id: 'pc-1', code: 'PC-01', name: 'First PC', locationName: 'Arena', available: true }, { id: 'pc-2', code: 'PC-02', name: 'Occupied PC', locationName: 'Arena', available: false }] }
function form() {
  const onChanged = vi.fn(async () => {}), onClose = vi.fn(), onBusyChange = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReservationEditForm value={value} onChanged={onChanged} onClose={onClose} onBusyChange={onBusyChange} /></QueryClientProvider>)
  return { onChanged, onClose, onBusyChange }
}
describe('reservation editing with optimistic concurrency', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false })
    server.use(http.get('/api/v1/reservations/reservation-1/resources', () => HttpResponse.json(options)))
  })

  it('preserves the original version and instant while saving a note and acknowledging refreshed data', async () => {
    let body: unknown
    server.use(http.patch('/api/v1/reservations/reservation-1', async ({ request }) => { body = await request.json(); await delay(60); return HttpResponse.json({ ...value, version: 4 }) }))
    const { onChanged, onClose, onBusyChange } = form(), user = userEvent.setup()
    const save = screen.getByRole('button', { name: 'Sačuvaj izmene' })
    await waitFor(() => expect(save).toBeEnabled())
    expect(screen.getByRole('option', { name: /Occupied PC/ })).toBeDisabled()
    await user.type(screen.getByLabelText('Napomena'), 'Updated note')
    await user.click(save)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(body).toEqual({ version: 3, startTime: value.startTime, resourceId: 'pc-1', note: 'Updated note' })
    expect(onChanged).toHaveBeenCalledOnce(); expect(onBusyChange).toHaveBeenCalledWith(true)
  })

  it('rejects past or incomplete dates and a resource that is no longer offered', async () => {
    server.use(http.get('/api/v1/reservations/reservation-1/resources', () => HttpResponse.json({ resources: [] })))
    form(); const user = userEvent.setup()
    expect(await screen.findByRole('option', { name: 'Trenutna stanica nije dostupna za ovaj termin' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sačuvaj izmene' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Datum i vreme (Europe/Belgrade)'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Sačuvaj izmene' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Datum i vreme (Europe/Belgrade)'), { target: { value: '2020-01-01T10:00' } })
    expect(screen.getByRole('button', { name: 'Sačuvaj izmene' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Odustani' }))
  })

  it('refreshes the reservation and options after a rejected save and can explicitly retry loading options', async () => {
    let reads = 0
    server.use(http.get('/api/v1/reservations/reservation-1/resources', () => ++reads === 1 ? HttpResponse.error() : HttpResponse.json(options)),
      http.patch('/api/v1/reservations/reservation-1', () => HttpResponse.json({ message: 'Reservation changed' }, { status: 409 })))
    const { onChanged, onClose } = form(), user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Pokušaj ponovo' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sačuvaj izmene' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Sačuvaj izmene' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Reservation changed')
    await waitFor(() => expect(reads).toBe(3))
    expect(onChanged).toHaveBeenCalledOnce(); expect(onClose).not.toHaveBeenCalled()
  })
})

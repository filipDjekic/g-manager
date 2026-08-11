import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { reservationApi } from '../api/reservationApi'
import { ReservationDetailsDrawer } from './ReservationDetailsDrawer'

const detail = {
  id: 'reservation-1', customerName: 'Ana Anić', customerContact: null,
  employeeName: 'Petar Petrović', serviceName: 'Masaža', durationMinutes: 60,
  startTime: '2028-03-16T09:00:00Z', endTime: '2028-03-16T10:00:00Z', status: 'PENDING',
  note: 'Tiha prostorija', createdAt: '2028-03-01T08:00:00Z', updatedAt: '2028-03-01T08:00:00Z',
  version: 0, allowedActions: ['CANCELLED'], history: [],
} as const

describe('ReservationDetailsDrawer', () => {
  it('shows scoped readable detail and submits only a server-allowed action through a modal', async () => {
    const user = userEvent.setup()
    const changeStatus = vi.spyOn(reservationApi, 'changeStatus').mockResolvedValue({
      ...detail, customerId: 'customer-1', employeeId: 'employee-1', serviceId: 'service-1',
      status: 'CANCELLED', version: 1,
    })
    server.use(
      http.get('/api/v1/reservations/reservation-1', () => HttpResponse.json(detail)),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <ReservationDetailsDrawer reservationId="reservation-1" onClose={vi.fn()} />
    </QueryClientProvider>)

    expect(await screen.findByText('Ana Anić')).toBeVisible()
    expect(screen.getByText('Petar Petrović')).toBeVisible()
    expect(screen.getByText('Masaža', { selector: 'dd' })).toBeVisible()
    expect(screen.queryByText('reservation-1')).not.toBeInTheDocument()
    expect(screen.queryByText('Kontakt')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Potvrdi' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Otkaži' }))
    const dialog = screen.getByRole('dialog', { name: 'Otkaži rezervaciju' })
    expect(dialog).toBeVisible()
    await user.type(screen.getByLabelText('Razlog ili napomena (opciono)'), 'Promena plana')
    expect(screen.getByLabelText('Razlog ili napomena (opciono)')).toHaveValue('Promena plana')
    await user.click(within(dialog).getByRole('button', { name: 'Otkaži' }))
    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reservation-1', version: 0 }), 'CANCELLED', 'Promena plana',
    ))
    expect(screen.queryByRole('dialog', { name: 'Otkaži rezervaciju' })).not.toBeInTheDocument()
  })
})

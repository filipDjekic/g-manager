import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import type { GamingStationCard } from '../types/gamingSession.types'
import { StartSessionDialog } from './StartSessionDialog'

const station: GamingStationCard = { resourceId: 'pc-1', resourceCode: 'PC-01', resourceName: 'First PC', locationId: 'loc-1', status: 'AVAILABLE', clientEnabled: true, staleHeartbeat: false, enforcementStatus: 'LOCKED', remainingSeconds: 0, allowedActions: ['START'] }
const customer = { id: 'customer-1', name: 'Ada', email: 'ada@example.test', active: true }
function form(fixed = false) {
  const onClose = vi.fn(), onStarted = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <StartSessionDialog station={fixed ? station : undefined} customer={fixed ? customer : undefined} onClose={onClose} onStarted={onStarted} />
  </QueryClientProvider>)
  return { onClose, onStarted }
}
describe('station assignments', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false })
    server.use(http.get('/api/v1/customers', () => HttpResponse.json({ content: [customer], totalPages: 1 })),
      http.get('/api/v1/gaming-operations/board', () => HttpResponse.json({ serverTime: new Date().toISOString(), stations: [station] })))
  })
  it('assigns a funded customer without duration, price or tariff', async () => {
    let body: unknown
    server.use(http.post('/api/v1/gaming-billing/assignments', async ({ request }) => { body = await request.json(); expect(request.headers.get('Idempotency-Key')).toBeTruthy(); return HttpResponse.json({ id: 'assignment-1' }) }))
    const { onClose } = form(true), user = userEvent.setup()
    const button = screen.getByRole('button', { name: 'Dodeli računar' })
    await waitFor(() => expect(button).toBeEnabled())
    expect(screen.queryByLabelText('Primljeni iznos (RSD)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Trajanje u minutima')).not.toBeInTheDocument()
    await user.click(button); await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(body).toEqual({ customerId: customer.id, resourceId: station.resourceId })
  })
  it('retains the original body and key after an uncertain response', async () => {
    const calls: { body: unknown; key: string | null }[] = []
    server.use(http.post('/api/v1/gaming-billing/assignments', async ({ request }) => { calls.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') }); return calls.length === 1 ? HttpResponse.error() : HttpResponse.json({ id: 'assignment-1' }) }))
    const { onClose } = form(true), user = userEvent.setup(), button = screen.getByRole('button', { name: 'Dodeli računar' })
    await waitFor(() => expect(button).toBeEnabled()); await user.click(button)
    await user.click(await screen.findByRole('button', { name: 'Proveri prethodni zahtev' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce()); expect(calls[1]).toEqual(calls[0])
  })
  it('requires positive time and never offers a guest balance', async () => {
    server.use(http.get('/api/v1/gaming-billing/customers/:id/time', () => HttpResponse.json({ balanceSeconds: 0, assignments: [], serverTime: new Date().toISOString() })))
    form(true); expect(await screen.findByText(/Raspoloživo vreme/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Dodeli računar' })).toBeDisabled()
    expect(screen.queryByRole('checkbox', { name: 'Gost bez registracije' })).not.toBeInTheDocument()
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
describe('gaming session start transactions', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false })
    server.use(http.get('/api/v1/customers', () => HttpResponse.json({ content: [customer], totalPages: 1 })),
      http.get('/api/v1/gaming-operations/board', () => HttpResponse.json({ serverTime: new Date().toISOString(), stations: [station, { ...station, resourceId: 'occupied', allowedActions: [] }] })))
  })

  it('selects an active customer, a permitted station and an explicit duration before sending', async () => {
    let requestBody: unknown, key: string | null = null
    server.use(http.post('/api/v1/gaming-sessions', async ({ request }) => { requestBody = await request.json(); key = request.headers.get('Idempotency-Key'); return HttpResponse.json({ id: 'session-1' }) }))
    const { onClose, onStarted } = form(), user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Ada.*ada@example\.test/ }))
    await screen.findByRole('option', { name: /First PC/ })
    expect(screen.queryByRole('option', { name: /occupied/ })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Slobodna stanica'), 'pc-1')
    await user.click(screen.getByRole('button', { name: '60 min' }))
    fireEvent.change(screen.getByLabelText('Trajanje u minutima'), { target: { value: '90' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Potvrdi naplatu i pokreni za Ada' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Potvrdi naplatu i pokreni za Ada' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(onStarted).toHaveBeenCalledOnce()
    expect(requestBody).toMatchObject({ purchase: { tariffId: 'tariff-1', tariffVersion: 0, payment: { method: 'CASH', amount: '300' } }, customerId: 'customer-1', resourceId: 'pc-1', durationMinutes: 90 })
    expect(key).toBeTruthy()
  })

  it('freezes an uncertain start and repeats its original command key and duration', async () => {
    const calls: Array<{ body: unknown; key: string | null }> = []
    server.use(http.post('/api/v1/gaming-sessions', async ({ request }) => {
      calls.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') })
      return calls.length === 1 ? HttpResponse.error() : HttpResponse.json({ id: 'session-1' })
    }))
    const { onClose } = form(true), user = userEvent.setup()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Potvrdi naplatu i pokreni za Ada' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Potvrdi naplatu i pokreni za Ada' }))
    const retry = await screen.findByRole('button', { name: 'Pokušaj ponovo' })
    expect(screen.getByLabelText('Trajanje u minutima')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Zatvori' })).toBeDisabled()
    await user.click(retry)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0])
  })

  it('recovers a failed station list without enabling a start when no station is available', async () => {
    let calls = 0
    server.use(http.get('/api/v1/gaming-operations/board', () => ++calls === 1 ? HttpResponse.error() : HttpResponse.json({ serverTime: new Date().toISOString(), stations: [] })))
    form(); const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await screen.findByText('Nema slobodnih stanica')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Potvrdi naplatu i pokreni za klijenta' })).toBeDisabled()
  })
  it('starts a guest with a priced payment and no permanent customer identity', async () => {
    let body: Record<string, unknown> | undefined
    server.use(http.post('/api/v1/gaming-sessions', async ({ request }) => { body = await request.json() as Record<string, unknown>; return HttpResponse.json({ id: 'guest-session' }) }))
    const { onClose } = form(), user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'Gost bez registracije' }))
    await screen.findByRole('option', { name: /First PC/ })
    await user.selectOptions(screen.getByLabelText('Slobodna stanica'), 'pc-1')
    const confirm = screen.getByRole('button', { name: 'Potvrdi naplatu i pokreni za Gost' })
    await waitFor(() => expect(confirm).toBeEnabled()); await user.click(confirm)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(body).toMatchObject({ guestName: 'Gost', resourceId: 'pc-1', purchase: { payment: { method: 'CASH', amount: '400' } } })
    expect(body).not.toHaveProperty('customerId')
  })

  it('starts metered gaming without advance payment or a purchased duration', async () => {
    let body: Record<string, unknown> | undefined
    server.use(http.get('/api/v1/gaming-billing/metered-policy', () => HttpResponse.json({ allowFixed: true, allowMetered: true, defaultMode: 'PREPAID_METERED', billingUnitSeconds: 1 })),
      http.get('/api/v1/gaming-billing/customers/customer-1', () => HttpResponse.json({ customerId: customer.id, balance: '1000', packages: [] })),
      http.post('/api/v1/gaming-sessions', async ({ request }) => { body = await request.json() as Record<string, unknown>; return HttpResponse.json({ id: 'metered-session' }) }))
    const { onClose } = form(true), user = userEvent.setup()
    const confirm = await screen.findByRole('button', { name: 'Pokreni prepaid igranje' })
    await waitFor(() => expect(confirm).toBeEnabled())
    expect(screen.queryByLabelText('Trajanje u minutima')).not.toBeInTheDocument()
    await user.click(confirm)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(body).toMatchObject({ billingMode: 'PREPAID_METERED', meteredTariffId: 'tariff-1', customerId: customer.id })
    expect(body).not.toHaveProperty('purchase'); expect(body).not.toHaveProperty('durationMinutes')
  })

})

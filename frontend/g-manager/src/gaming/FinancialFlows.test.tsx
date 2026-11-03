import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import type { GamingStationCard } from '../types/gamingSession.types'
import { StationFinanceActions } from './StationFinanceActions'
import { GamingTariffSettings } from '../settings/GamingTariffSettings'
import { StartSessionDialog } from './StartSessionDialog'
const station: GamingStationCard = { resourceId: 'pc-1', resourceCode: 'PC1', resourceName: 'Gaming PC', locationId: 'loc-1', status: 'ACTIVE', sessionId: 's1', customerId: 'c1', sessionVersion: 1, clientEnabled: true, staleHeartbeat: false, enforcementStatus: 'UNLOCKED', remainingSeconds: 3600, allowedActions: ['EXTEND', 'TERMINATE'] }
function wrapper(children: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>) }
beforeEach(() => useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'test-token', isInitializing: false }))
it('freezes an uncertain financial payment and retries the same payload and key', async () => {
  const calls: { body: unknown; key: string | null }[] = []
  server.use(http.get('/api/v1/gaming-billing/sessions/s1', () => HttpResponse.json({ sessionId: 's1', due: '100', currency: 'RSD', charges: [], transactions: [] })),
    http.post('/api/v1/gaming-billing/sessions/s1/payments', async ({ request }) => { calls.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') }); return calls.length === 1 ? HttpResponse.error() : HttpResponse.json({}) }))
  wrapper(<StationFinanceActions station={station} />); const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Naplata i finansijska istorija' }))
  fireEvent.change(await screen.findByLabelText('Iznos RSD'), { target: { value: '100.00' } })
  await user.click(screen.getByRole('button', { name: 'Potvrdi primljenu uplatu' }))
  const retry = await screen.findByRole('button', { name: 'Proveri prethodni zahtev' })
  expect(screen.getByLabelText('Iznos RSD')).toBeDisabled(); await user.click(retry)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]); expect(calls[0].key).toBeTruthy()
})
it('requires an explicit privacy review before submitting station preparation', async () => {
  let body: unknown
  server.use(http.get('/api/v1/gaming-operations/stations/pc-1/preparation', () => HttpResponse.json({ ready: false, session_id: 's1' })),
    http.post('/api/v1/gaming-operations/stations/pc-1/prepare', async ({ request }) => { body = await request.json(); return new HttpResponse(null, { status: 200 }) }))
  wrapper(<StationFinanceActions station={{ ...station, sessionId: undefined, latestSessionId: 's1', privacyReady: false }} />); const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Priprema privatnosti' }))
  expect(screen.getByRole('button', { name: 'Potvrdi proverenu pripremu' })).toBeDisabled()
  await user.type(screen.getByLabelText('Opis izvrsene provere'), 'Profile isolated and accounts reviewed')
  await user.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Potvrdi proverenu pripremu' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Potvrdi proverenu pripremu' }))
  await waitFor(() => expect(body).toEqual({ sessionId: 's1', isolatedProfileVerified: true, reason: 'Profile isolated and accounts reviewed' }))
})
it('saves configurable category tariffs through the real API client', async () => {
  let body: unknown, key: string | null = null
  server.use(http.get('/api/v1/gaming-billing/policy', () => HttpResponse.json({ allowPartialPayment: false, allowDebt: false, allowRefunds: false, minimumMinutes: 15, maximumMinutes: 480, employeeDiscountLimit: '0', version: 0 })),
    http.get('/api/v1/catalog', () => HttpResponse.json({ content: [{ id: 'vip-service', name: 'VIP gaming' }] })),
    http.post('/api/v1/gaming-billing/tariffs', async ({ request }) => { body = await request.json(); key = request.headers.get('Idempotency-Key'); return HttpResponse.json({ id: 'new' }) }))
  wrapper(<GamingTariffSettings />); const user = userEvent.setup()
  await user.type(screen.getByLabelText('Naziv'), 'VIP half hour')
  fireEvent.change(screen.getByLabelText('Minuta po bloku'), { target: { value: '30' } })
  await user.type(screen.getByLabelText('Cena RSD'), '125.50')
  await screen.findByRole('option', { name: 'VIP gaming' }); await user.selectOptions(screen.getByLabelText('Kategorija / usluga'), 'vip-service')
  await user.click(screen.getByRole('button', { name: 'Sacuvaj tarifu' }))
  await waitFor(() => expect(body).toMatchObject({ name: 'VIP half hour', serviceId: 'vip-service', minutes: 30, price: '125.5', version: 0 }))
  expect(key).toBeTruthy()
})
it('honors an existing prepaid package when its original tariff is no longer for sale', async () => {
  let body: unknown
  server.use(http.get('/api/v1/gaming-billing/tariffs', () => HttpResponse.json([])),
    http.get('/api/v1/gaming-billing/customers/c1', () => HttpResponse.json({ customerId: 'c1', balance: '0', packages: [{ id: 'p1', remaining_minutes: 180, minutes: 180, price: '450' }], ledger: [], transactions: [] })),
    http.get('/api/v1/gaming-billing/quote', ({ request }) => new URL(request.url).searchParams.get('packageId') === 'p1' ? HttpResponse.json({ tariffId: 'original-tariff', tariffVersion: 2, minutes: 120, gross: '0', discount: '0', total: '0' }) : HttpResponse.json({}, { status: 422 })),
    http.post('/api/v1/gaming-sessions', async ({ request }) => { body = await request.json(); return HttpResponse.json({ id: 'new' }) }))
  wrapper(<StartSessionDialog station={station} customer={{ id: 'c1', name: 'Customer', email: 'c1@test' }} onClose={() => {}} />); const user = userEvent.setup()
  await screen.findByRole('option', { name: /Kupljen paket vremena/ }); await user.selectOptions(screen.getByLabelText('Nacin placanja'), 'TIME_PACKAGE')
  await user.selectOptions(screen.getByLabelText('Paket vremena'), 'p1')
  const submit = screen.getByRole('button', { name: 'Potvrdi naplatu i pokreni za Customer' }); await waitFor(() => expect(submit).toBeEnabled()); await user.click(submit)
  await waitFor(() => expect(body).toMatchObject({ customerId: 'c1', purchase: { tariffId: 'original-tariff', tariffVersion: 2, packageId: 'p1', payment: { method: 'TIME_PACKAGE', amount: '0' } } }))
})

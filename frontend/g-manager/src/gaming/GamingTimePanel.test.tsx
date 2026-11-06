import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { useAuthStore } from '../auth/authStore'
import { authUser, pageResponse } from '../test/fixtures'
import { server } from '../test/server'
import { GamingTimePanel } from './GamingTimePanel'
import { GamingPaymentHistory } from './GamingPaymentHistory'
import { GamingExtensionDialog } from './GamingExtensionDialog'
import { RecordTimeDialog } from './RecordTimeDialog'
import { StationFinanceActions } from './StationFinanceActions'
import type { GamingStationCard } from '../types/gamingSession.types'

const station: GamingStationCard = { resourceId: 'pc-1', resourceCode: 'PC1', resourceName: 'Gaming PC', locationId: 'loc-1', status: 'ACTIVE', sessionId: 's1', customerId: 'customer-1', billingMode: 'TIME_BALANCE', clientEnabled: true, staleHeartbeat: false, enforcementStatus: 'UNLOCKED', remainingSeconds: 7200, allowedActions: ['EXTEND'] }
const wrapper = (element: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>)
const renderPanel = () => wrapper(<GamingTimePanel customerId="customer-1" />)
beforeEach(() => useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false }))

it.each(['OWNER', 'ADMIN', 'EMPLOYEE'] as const)('calculates the price and adds whole minutes as %s', async role => {
  useAuthStore.setState({ user: authUser(role) })
  let body: unknown, balanceSeconds = 7200
  server.use(http.get('/api/v1/gaming-billing/customers/:id/time', () => HttpResponse.json({ balanceSeconds, assignments: [] })),
    http.post('/api/v1/gaming-billing/customers/:id/time-grants', async ({ request }) => { body = await request.json(); balanceSeconds += 31 * 60; expect(request.headers.get('Idempotency-Key')).toBeTruthy(); return HttpResponse.json({}) }))
  renderPanel()
  const input = screen.getByLabelText('Dodaj minute')
  fireEvent.change(input, { target: { value: '31' } })
  expect(await screen.findByText('77.50 RSD')).toBeVisible()
  expect(screen.getByText(/Novo stanje vremena/)).toHaveTextContent('2h 31m 00s')
  expect(screen.queryByLabelText('Primljeni iznos (RSD)')).not.toBeInTheDocument()
  expect(screen.queryByText('Autorizovana korekcija ili poništavanje')).not.toBeInTheDocument()
  expect(screen.queryByText('Arhivirana istorija kredita i paketa')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Potvrdi uplatu' }))
  await waitFor(() => expect(body).toEqual({ minutes: 31, priceVersion: 1, method: 'CASH' }))
  await waitFor(() => expect(screen.getByText(/Raspoloživo vreme/)).toHaveTextContent('2h 31m 00s'))
})
it('records an external POS receipt without contacting a payment processor', async () => {
  let body: unknown
  server.use(http.post('/api/v1/gaming-billing/customers/:id/time-grants', async ({ request }) => { body = await request.json(); return HttpResponse.json({}) }))
  renderPanel()
  const user = userEvent.setup()
  await user.selectOptions(screen.getByLabelText('Način evidentiranja uplate'), 'EXTERNAL_POS')
  await user.type(screen.getByLabelText('POS referenca'), 'POS-42')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Potvrdi uplatu' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Potvrdi uplatu' }))
  await waitFor(() => expect(body).toEqual({ minutes: 30, priceVersion: 1, method: 'EXTERNAL_POS', reference: 'POS-42' }))
})
it('accepts thirty minutes and rejects shorter or fractional additions', async () => {
  renderPanel()
  const input = screen.getByLabelText('Dodaj minute'), submit = screen.getByRole('button', { name: 'Potvrdi uplatu' })
  await waitFor(() => expect(submit).toBeEnabled())
  expect(input).toHaveValue(30); expect(screen.getByText('75.00 RSD')).toBeVisible()
  for (const value of ['29', '0', '30.5', '']) {
    fireEvent.change(input, { target: { value } })
    expect(submit).toBeDisabled()
  }
})
it('requires a configured price without inventing a default', async () => {
  server.use(http.get('/api/v1/gaming-billing/time-price', () => HttpResponse.json({ pricePerMinute: null, version: 0 })))
  renderPanel()
  expect(await screen.findByText(/treba da podesi cenu/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Potvrdi uplatu' })).toBeDisabled()
})
it('shows customer time without payment controls or financial history', async () => {
  useAuthStore.setState({ user: { ...authUser('CUSTOMER'), id: 'customer-1' } })
  renderPanel()
  expect(await screen.findByText(/Raspoloživo vreme/)).toHaveTextContent('2h 0m 00s')
  expect(screen.queryByRole('button', { name: 'Potvrdi uplatu' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Dodaj minute')).not.toBeInTheDocument()
})
it('keeps payment history in a separate authorized view', async () => {
  server.use(http.get('/api/v1/gaming-billing/customers/:id/time/transactions', () => HttpResponse.json(pageResponse([{ id: 'old', kind: 'TIME_GRANT', amount: '450.00', created_at: '2026-01-01T10:00:00Z', reason: 'Sačuvana evidencija' }]))))
  wrapper(<GamingPaymentHistory customerId="customer-1" />)
  expect(screen.queryByText(/Sačuvana evidencija/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Istorija uplata' }))
  expect(await screen.findByText(/450.00 RSD/)).toHaveTextContent('Sačuvana evidencija')
  expect(screen.queryByLabelText('Dodaj minute')).not.toBeInTheDocument()
})
it('retries an uncertain payment with the same minutes, price version and key', async () => {
  const calls: { body: unknown; key: string | null }[] = []
  server.use(http.post('/api/v1/gaming-billing/customers/:id/time-grants', async ({ request }) => { calls.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') }); return calls.length === 1 ? HttpResponse.error() : HttpResponse.json({}) }))
  renderPanel()
  const submit = screen.getByRole('button', { name: 'Potvrdi uplatu' })
  await waitFor(() => expect(submit).toBeEnabled()); await userEvent.click(submit)
  const retry = await screen.findByRole('button', { name: 'Proveri prethodni zahtev' })
  expect(screen.getByLabelText('Dodaj minute')).toBeDisabled()
  await userEvent.click(retry)
  await waitFor(() => expect(calls).toHaveLength(2))
  expect(calls[1]).toEqual(calls[0]); expect(calls[0].key).toBeTruthy()
})
it('adds time to an active account through the same payment form', async () => {
  let body: unknown
  server.use(http.post('/api/v1/gaming-billing/customers/:id/time-grants', async ({ request }) => { body = await request.json(); return HttpResponse.json({}) }))
  wrapper(<GamingExtensionDialog station={station} initialMinutes={30} onClose={() => {}} />)
  const submit = screen.getByRole('button', { name: 'Potvrdi uplatu' })
  await waitFor(() => expect(submit).toBeEnabled()); await userEvent.click(submit)
  await waitFor(() => expect(body).toEqual({ minutes: 30, priceVersion: 1, method: 'CASH' }))
})
it('selects a customer before confirming payment at the desk', async () => {
  let body: unknown
  server.use(http.get('/api/v1/customers', () => HttpResponse.json(pageResponse([{ id: 'customer-1', name: 'Ada', email: 'ada@example.test', active: true }]))),
    http.post('/api/v1/gaming-billing/customers/:id/time-grants', async ({ request }) => { body = await request.json(); return HttpResponse.json({}) }))
  wrapper(<RecordTimeDialog onClose={() => {}} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('searchbox', { name: 'Pronađi klijenta' }), 'Ada')
  await waitFor(() => expect(screen.getByRole('button', { name: /Ada.*ada@example.test/ })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: /Ada.*ada@example.test/ }))
  const submit = screen.getByRole('button', { name: 'Potvrdi uplatu' })
  await waitFor(() => expect(submit).toBeEnabled()); await user.click(submit)
  await waitFor(() => expect(body).toEqual({ minutes: 30, priceVersion: 1, method: 'CASH' }))
})
it('opens a compact payment dialog with one title', async () => {
  wrapper(<StationFinanceActions station={station} />)
  await userEvent.click(screen.getByRole('button', { name: 'Plaćanje' }))
  const dialog = await screen.findByRole('dialog', { name: 'Plaćanje' })
  expect(within(dialog).getAllByRole('heading', { name: 'Plaćanje' })).toHaveLength(1)
  expect(within(dialog).queryByText('Istorija uplata')).not.toBeInTheDocument()
})

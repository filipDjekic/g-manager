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
import { GamingTimeSettings } from '../settings/GamingTimeSettings'

const station: GamingStationCard = { resourceId: 'pc-1', resourceCode: 'PC1', resourceName: 'Gaming PC', locationId: 'loc-1', status: 'AVAILABLE', clientEnabled: true, staleHeartbeat: false, enforcementStatus: 'LOCKED', remainingSeconds: 0, allowedActions: [] }
function wrapper(children: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>) }
beforeEach(() => useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'test-token', isInitializing: false }))
it('requires a privacy review before reusing the computer', async () => {
  let body: unknown
  server.use(http.get('/api/v1/gaming-operations/stations/pc-1/preparation', () => HttpResponse.json({ ready: false, session_id: 's1' })),
    http.post('/api/v1/gaming-operations/stations/pc-1/prepare', async ({ request }) => { body = await request.json(); return new HttpResponse(null, { status: 200 }) }))
  wrapper(<StationFinanceActions station={{ ...station, latestSessionId: 's1', privacyReady: false }} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Priprema privatnosti' }))
  expect(screen.getByRole('button', { name: 'Potvrdi proverenu pripremu' })).toBeDisabled()
  await user.type(screen.getByLabelText('Opis izvrsene provere'), 'Profile isolated and accounts reviewed')
  await user.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Potvrdi proverenu pripremu' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Potvrdi proverenu pripremu' }))
  await waitFor(() => expect(body).toEqual({ sessionId: 's1', isolatedProfileVerified: true, reason: 'Profile isolated and accounts reviewed' }))
})
it('saves an explicit minute price with its current configuration version', async () => {
  let body: unknown
  server.use(http.put('/api/v1/gaming-billing/time-price', async ({ request }) => { body = await request.json(); return HttpResponse.json({ pricePerMinute: '3.25', version: 2 }) }))
  wrapper(<GamingTimeSettings />)
  const input = await screen.findByLabelText('Cena po minutu (RSD)')
  await waitFor(() => expect(input).toHaveValue(2.5))
  fireEvent.change(input, { target: { value: '3.25' } })
  await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj cenu' }))
  await waitFor(() => expect(body).toEqual({ pricePerMinute: '3.25', version: 1 }))
  expect(await screen.findByText('Cena je sačuvana.')).toBeVisible()
})
it('leaves an unconfigured price blank and rejects zero', async () => {
  server.use(http.get('/api/v1/gaming-billing/time-price', () => HttpResponse.json({ pricePerMinute: null, version: 0 })))
  wrapper(<GamingTimeSettings />)
  const input = await screen.findByLabelText('Cena po minutu (RSD)')
  expect(input).toHaveValue(null)
  expect(screen.getByRole('button', { name: 'Sačuvaj cenu' })).toBeDisabled()
  fireEvent.change(input, { target: { value: '0' } })
  expect(screen.getByRole('button', { name: 'Sačuvaj cenu' })).toBeDisabled()
})

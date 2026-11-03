import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { GamingStationCard } from '../types/gamingSession.types'
import { StationTile } from './GamingStationViews'
import { needsAttention } from './presentation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../test/server'
import { GamingPilotHealth } from './GamingPilotHealth'
const station: GamingStationCard = { resourceId: 'pc', resourceCode: 'PC1', resourceName: 'Pilot PC', locationId: 'loc', status: 'CLIENT_ERROR', clientEnabled: true, staleHeartbeat: false, enforcementStatus: 'UNKNOWN', remainingSeconds: 0, allowedActions: [], clientErrorCode: 'RECOVERY_FAILED', updateStatus: 'FAILED' }
const handlers = { onStart: vi.fn(), onExtend: vi.fn(), onEnd: vi.fn(), onCustom: vi.fn(), onHistory: vi.fn(), onRecovery: vi.fn() }
it('shows a client recovery failure and failed update without offering a new session', () => {
  render(<StationTile station={station} seconds={0} selected={false} disabled={false} onSelect={vi.fn()} handlers={handlers} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Client zahteva proveru: RECOVERY_FAILED')
  expect(screen.getByText(/Poslednje ažuriranje nije uspelo/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Pokreni sesiju' })).not.toBeInTheDocument()
  expect(needsAttention(station)).toBe(true)
})
it('labels cached errors as the last reported error when the heartbeat is stale', () => {
  render(<StationTile station={{ ...station, status: 'OFFLINE', staleHeartbeat: true }} seconds={0} selected={false} disabled={false} onSelect={vi.fn()} handlers={handlers} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Poslednja prijavljena greška: RECOVERY_FAILED')
  expect(screen.queryByText('Povezan')).not.toBeInTheDocument()
})
it('hides previously healthy server and database values after a failed refresh', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  server.use(http.get('/api/v1/gaming-operations/health', () => HttpResponse.json({ checkedAt: '2026-11-03T12:00:00Z', backend: 'UP', database: 'UP', financialLedger: 'UP' })))
  render(<QueryClientProvider client={client}><GamingPilotHealth visible /></QueryClientProvider>)
  await userEvent.click(screen.getByText('Dijagnostika sistema'))
  await screen.findByText(/Server: U redu/)
  server.use(http.get('/api/v1/gaming-operations/health', () => new HttpResponse(null, { status: 503 })))
  await client.invalidateQueries({ queryKey: ['gaming-pilot-health'] })
  expect(await screen.findByRole('alert')).toHaveTextContent('Stanje servera i baze nije potvrđeno')
  expect(screen.queryByText(/Server: U redu/)).not.toBeInTheDocument()
  client.clear()
})

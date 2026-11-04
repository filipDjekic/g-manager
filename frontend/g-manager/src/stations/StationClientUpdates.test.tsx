import { pageResponse } from '../test/fixtures'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import { StationClientUpdates } from './StationClientUpdates'

beforeEach(() => useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false }))
const release = { version: '4.0.0', status: 'RELEASED', downloadUrl: 'https://updates.example.test/client.zip', sha256: 'a'.repeat(64) }
function setup(installedVersion = '3.0.0') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><StationClientUpdates stationId="pc-1" installedVersion={installedVersion} /></QueryClientProvider>)
  return client
}

it('requests a delayed update for one station and displays its confirmed history', async () => {
  let body: Record<string, unknown> | undefined
  server.use(http.get('/api/v1/stations/client-package', () => HttpResponse.json(release)),
    http.get('/api/v1/stations/pc-1/client-updates', () => HttpResponse.json(pageResponse(body ? [{ id: 'intent-1', targetVersion: '4.0.0', status: 'INSTALLING', updatedAt: new Date().toISOString(), reason: body.reason }] : []))),
    http.post('/api/v1/stations/pc-1/client-updates', async ({ request }) => { body = await request.json() as Record<string, unknown>; return HttpResponse.json({ id: 'intent-1' }) }))
  setup(); const user = userEvent.setup()
  await user.type(screen.getByLabelText('Razlog'), 'Canary station')
  await user.selectOptions(screen.getByLabelText('Početak ažuriranja'), '15')
  const before = Date.now()
  await user.click(await screen.findByRole('button', { name: 'Zatraži ažuriranje ove stanice' }))
  expect(await screen.findByText(/4.0.0 · Instalacija u toku/)).toBeVisible()
  expect(body?.reason).toBe('Canary station')
  expect(Date.parse(body?.notBefore as string)).toBeGreaterThanOrEqual(before + 15 * 60000)
  expect(Object.keys(body!)).toEqual(['reason', 'notBefore'])
})

it.each(['4.0.1', '4.0.0.0'])('does not offer a downgrade or equal revision to a station at %s', async installed => {
  server.use(http.get('/api/v1/stations/client-package', () => HttpResponse.json(release)),
    http.get('/api/v1/stations/pc-1/client-updates', () => HttpResponse.json(pageResponse([]))))
  setup(installed)
  await userEvent.setup().type(screen.getByLabelText('Razlog'), 'After server rollback')
  await screen.findByText('Nema zabeleženih zahteva za ažuriranje.')
  expect(screen.getByRole('button', { name: 'Zatraži ažuriranje ove stanice' })).toBeDisabled()
})

it('hides cached successful history and disables requests when status refresh fails', async () => {
  server.use(http.get('/api/v1/stations/client-package', () => HttpResponse.json(release)),
    http.get('/api/v1/stations/pc-1/client-updates', () => HttpResponse.json(pageResponse([]))))
  const client = setup(), key = ['stations', 'pc-1', 'client-updates', { page: 0, size: 10 }]
  await screen.findByText('Nema zabeleženih zahteva za ažuriranje.')
  client.setQueryData(key, pageResponse([{ id: 'old', targetVersion: '3.0.0', status: 'APPLIED', updatedAt: new Date().toISOString(), reason: 'Old confirmed result' }]))
  expect(await screen.findByText(/Old confirmed result/)).toBeVisible()
  server.use(http.get('/api/v1/stations/pc-1/client-updates', () => new HttpResponse(null, { status: 503 })))
  await client.invalidateQueries({ queryKey: key })
  expect(await screen.findByText('Istorija ažuriranja trenutno nije potvrđena.')).toBeVisible()
  expect(screen.queryByText(/Old confirmed result/)).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Zatraži ažuriranje ove stanice' })).toBeDisabled())
})

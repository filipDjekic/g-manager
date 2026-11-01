import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { testArea, testLocation, testResource } from '../test/resourceFixtures'
import { server } from '../test/server'
import { ResourceEditor, type ResourceEditorKind } from './ResourceEditor'

const records = { LOCATION: testLocation, AREA: testArea, RESOURCE: testResource() }
function editor(kind: ResourceEditorKind, existing = false) {
  const onSaved = vi.fn(), onClose = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ResourceEditor kind={kind} initial={existing ? records[kind] : undefined} locationId={testLocation.id} areaId={testArea.id} onSaved={onSaved} onClose={onClose} />
  </QueryClientProvider>)
  return { onSaved, onClose }
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })

describe('resource editing transactions', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'test-token', isInitializing: false })
    server.use(http.get('/api/v1/catalog', () => HttpResponse.json({ content: [{ id: 'service-1', name: 'Gaming session' }] })))
  })

  it.each((['LOCATION', 'AREA', 'RESOURCE'] as const).flatMap(kind => [false, true].map(existing => ({ kind, existing }))))('saves $kind (existing: $existing) with numeric geometry and the original version', async ({ kind, existing }) => {
    const user = userEvent.setup(), requests: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
    server.use(http.all('/api/v1/resources/*', async ({ request }) => {
      requests.push({ method: request.method, path: new URL(request.url).pathname, body: await request.json() as Record<string, unknown> })
      return HttpResponse.json({ ...records[kind], id: 'saved-id', version: 5 })
    }))
    const { onSaved, onClose } = editor(kind, existing)
    change('Naziv', '  Updated name  '); change('Šifra', ' NEW '); change('Opis', ' Updated description ')
    await user.click(screen.getByLabelText('Aktivan', { exact: true }))
    if (kind === 'LOCATION') { change('Adresa', ' New address '); change('Vremenska zona', 'Europe/London') }
    if (kind === 'AREA') {
      await user.click(screen.getByText('Veličina mape zone', { selector: 'summary' }))
      change('Širina mape', '1200'); change('Visina mape', '900')
    }
    if (kind === 'RESOURCE') {
      await screen.findByRole('option', { name: 'Gaming session' })
      fireEvent.change(screen.getByLabelText('Usluga'), { target: { value: 'service-1' } })
      fireEvent.change(screen.getByLabelText('Tip'), { target: { value: 'PLAYSTATION' } })
      change('Kapacitet', '2')
      await user.click(screen.getByText('Pozicija i dimenzije na mapi', { selector: 'summary' }))
      for (const [label, value] of Object.entries({ X: '40', Y: '50', Širina: '160', Visina: '100', Rotacija: '90' })) change(label, value)
      await user.click(screen.getByLabelText('Dozvoljeno zakazivanje'))
    }
    if (kind !== 'LOCATION') change('Redosled prikaza', '2')
    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('saved-id'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ method: existing ? 'PUT' : 'POST', body: { name: 'Updated name', code: 'NEW', description: 'Updated description', active: false, ...(existing ? { version: records[kind].version } : {}) } })
    expect(requests[0].path).toBe(existing ? `/api/v1/resources/${kind === 'LOCATION' ? 'locations/' : kind === 'AREA' ? 'areas/' : ''}${records[kind].id}` : kind === 'LOCATION' ? '/api/v1/resources/locations' : kind === 'AREA' ? '/api/v1/resources/locations/loc-1/areas' : '/api/v1/resources/areas/area-1')
    if (kind === 'RESOURCE') expect(requests[0].body).toMatchObject({ serviceId: 'service-1', type: 'PLAYSTATION', capacity: 2, x: 40, y: 50, width: 160, height: 100, rotation: 90, bookable: false })
    if (kind === 'AREA') expect(requests[0].body).toMatchObject({ mapWidth: 1200, mapHeight: 900 })
    if (kind === 'LOCATION') expect(requests[0].body).toMatchObject({ address: 'New address', timezone: 'Europe/London' })
  })

  it('requires explicit confirmation before discarding edited geometry', async () => {
    const user = userEvent.setup(), { onClose } = editor('AREA', true)
    await user.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(onClose).toHaveBeenCalledOnce()
    onClose.mockClear(); change('Naziv', 'Unsaved')
    await user.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Odbaci izmene' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('prevents duplicate requests and allows an explicit retry after a rejected save', async () => {
    let calls = 0
    server.use(http.put('/api/v1/resources/locations/loc-1', async () => {
      calls++; await delay(80)
      return calls === 1 ? HttpResponse.json({ message: 'Changed on server' }, { status: 409 }) : HttpResponse.json(testLocation)
    }))
    const user = userEvent.setup(), { onSaved } = editor('LOCATION', true)
    const save = screen.getByRole('button', { name: 'Sačuvaj' })
    await user.click(save)
    fireEvent.submit(save.closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Changed on server')
    expect(calls).toBe(1); expect(onSaved).not.toHaveBeenCalled()
    await user.click(save)
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(testLocation.id))
    expect(calls).toBe(2)
  })
})

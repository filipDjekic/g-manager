import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { testCatalogItem } from '../test/catalogFixtures'
import { server } from '../test/server'
import { CatalogPage } from './CatalogPage'

function page(path = '/catalog') {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><CatalogPage /></MemoryRouter></QueryClientProvider>)
}
async function action(name: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Akcije za Game hour' }))
  await user.click(screen.getByRole('menuitem', { name }))
}
describe('catalog management transactions', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false })
    server.use(http.get('/api/v1/saved-views', () => HttpResponse.json([])),
      http.get('/api/v1/catalog/statistics', () => HttpResponse.json({ serviceCount: 1, activeServiceCount: 1, productCount: 0, inactiveCount: 0, administrative: true, maxImageBytes: 1048576 })))
  })

  it('deactivates, activates, deletes with a reason and restores the same versioned item', async () => {
    let item = testCatalogItem(), removed = false
    const commands: string[] = []
    const response = () => HttpResponse.json({ content: removed ? [] : [item], page: 0, size: 10, totalElements: removed ? 0 : 1, totalPages: removed ? 0 : 1 })
    server.use(
      http.get('/api/v1/catalog', response), http.get('/api/v1/catalog/item-1', () => HttpResponse.json(item)),
      http.get('/api/v1/catalog/deleted', () => HttpResponse.json({ content: removed ? [{ ...item, deletedAt: '2028-02-01T10:00:00Z' }] : [], page: 0, size: 10, totalElements: removed ? 1 : 0, totalPages: 1 })),
      http.patch('/api/v1/catalog/item-1/:command', ({ params, request }) => {
        expect(new URL(request.url).searchParams.get('version')).toBe(String(item.version))
        commands.push(String(params.command)); item = { ...item, active: params.command === 'activate', version: item.version + 1 }; return HttpResponse.json(item)
      }),
      http.delete('/api/v1/catalog/item-1', async ({ request }) => { expect(await request.json()).toEqual({ reason: 'Retired offer' }); commands.push('delete'); removed = true; return new HttpResponse(null, { status: 204 }) }),
      http.post('/api/v1/catalog/item-1/restore', () => { commands.push('restore'); removed = false; return HttpResponse.json(item) }),
    )
    page(); const user = userEvent.setup()
    await screen.findByRole('button', { name: 'Akcije za Game hour' })
    await action('Deaktiviraj')
    await user.click(within(screen.getByRole('dialog', { name: 'Deaktiviraj stavku' })).getByRole('button', { name: 'Deaktiviraj' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await action('Aktiviraj')
    await user.click(within(screen.getByRole('dialog', { name: 'Aktiviraj stavku' })).getByRole('button', { name: 'Aktiviraj' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await action('Obriši')
    const confirmation = screen.getByRole('dialog', { name: 'Obriši stavku' })
    expect(within(confirmation).getByRole('button', { name: 'Obriši' })).toBeDisabled()
    await user.type(within(confirmation).getByLabelText('Razlog brisanja'), 'Retired offer')
    await user.click(within(confirmation).getByRole('button', { name: 'Obriši' }))
    expect(await screen.findByText('Nema stavki')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Obrisane stavke' }))
    await screen.findByRole('button', { name: 'Akcije za Game hour' })
    await action('Vrati stavku')
    await user.click(within(screen.getByRole('dialog', { name: 'Vrati stavku' })).getByRole('button', { name: 'Vrati' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Vrati se u katalog' }))
    expect(await screen.findByRole('button', { name: 'Akcije za Game hour' })).toBeVisible()
    expect(commands).toEqual(['deactivate', 'activate', 'delete', 'restore'])
  }, 15000)

  it('reports partial bulk failures by name, clears selection and can dismiss the result', async () => {
    server.use(http.get('/api/v1/catalog', () => HttpResponse.json({ content: [testCatalogItem(), testCatalogItem({ id: 'item-2', name: 'Console hour', version: 5 })], page: 0, size: 10, totalElements: 2, totalPages: 1 })),
      http.post('/api/v1/catalog/bulk/activation', async ({ request }) => {
        expect(await request.json()).toEqual({ action: 'DEACTIVATE', items: [{ id: 'item-1', version: 3 }, { id: 'item-2', version: 5 }] })
        return HttpResponse.json({ requested: 2, succeeded: 1, failed: 1, outcomes: [{ id: 'item-1', success: true, message: 'OK' }, { id: 'item-2', success: false, message: 'Changed concurrently' }] })
      }))
    page(); const user = userEvent.setup()
    await user.click(await screen.findByLabelText('Izaberi stavku Game hour'))
    await user.click(screen.getByLabelText('Izaberi stavku Console hour'))
    await user.click(screen.getByRole('button', { name: 'Deaktiviraj izabrane' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deaktiviraj' }))
    expect(await screen.findByText('1 uspešno, 1 neuspešno od 2 stavki.')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Console hour: Changed concurrently')
    expect(screen.getByLabelText('Izaberi stavku Game hour')).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Zatvori rezultat' }))
    expect(screen.queryByText('Stavke koje nisu promenjene')).not.toBeInTheDocument()
  })

  it('blocks invalid price ranges, serializes valid filters and can clear an empty search', async () => {
    const queries: URLSearchParams[] = []
    server.use(http.get('/api/v1/catalog', ({ request }) => { queries.push(new URL(request.url).searchParams); return HttpResponse.json({ content: [], page: 0, size: 10, totalElements: 0, totalPages: 0 }) }))
    page('/catalog?page=999999999999999&size=999&sort=invalid'); const user = userEvent.setup()
    await screen.findByText('Nema stavki')
    await user.selectOptions(screen.getByLabelText('Cena'), 'range')
    fireEvent.change(screen.getByLabelText('Minimalna cena (RSD)'), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText('Maksimalna cena (RSD)'), { target: { value: '100' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Minimalna cena ne može biti veća od maksimalne.')
    fireEvent.change(screen.getByLabelText('Minimalna cena (RSD)'), { target: { value: '-1' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Cena mora biti validan broj koji nije negativan.')
    fireEvent.change(screen.getByLabelText('Minimalna cena (RSD)'), { target: { value: '50' } })
    await user.selectOptions(screen.getByLabelText('Status'), 'true')
    await user.selectOptions(screen.getByLabelText('Sortiranje'), 'price:DESC')
    await waitFor(() => expect(queries.at(-1)?.get('direction')).toBe('DESC'))
    expect(queries.at(-1)?.get('active')).toBe('true')
    expect(queries.at(-1)?.get('minPrice')).toBe('50')
    await user.type(screen.getByLabelText('Pretraga'), 'not present')
    await waitFor(() => expect(queries.at(-1)?.get('search')).toBe('not present'))
    await user.click(screen.getByRole('button', { name: 'Očisti filtere' }))
    expect(screen.getByLabelText('Pretraga')).toHaveValue('')
    expect(screen.queryByLabelText('Minimalna cena (RSD)')).not.toBeInTheDocument()
  })
})

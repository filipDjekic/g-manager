import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { createRef } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { testCatalogItem } from '../test/catalogFixtures'
import { server } from '../test/server'
import type { CatalogItem } from '../types/catalog.types'
import { CatalogFormDialog } from './CatalogFormDialog'

const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL
beforeAll(() => { URL.createObjectURL = vi.fn(() => 'blob:catalog-preview'); URL.revokeObjectURL = vi.fn() })
afterAll(() => { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke })
function form(item?: CatalogItem, imageOnly = false) {
  const onSaved = vi.fn(), onClose = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CatalogFormDialog initialType="SERVICE" item={item} imageOnly={imageOnly} maxImageBytes={8} onSaved={onSaved} onClose={onClose} returnFocusRef={createRef()} />
  </QueryClientProvider>)
  return { onSaved, onClose }
}
const change = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const file = (value: File) => fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [value] } })

describe('catalog form persistence and image upload', () => {
  beforeEach(() => useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false }))

  it('validates required fields and prevents a product from retaining service-only settings', async () => {
    let body: unknown
    server.use(http.post('/api/v1/catalog', async ({ request }) => { body = await request.json(); return HttpResponse.json(testCatalogItem({ type: 'PRODUCT', durationMinutes: null, requiresResource: false })) }))
    const { onSaved, onClose } = form(), user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Kreiraj stavku' }))
    expect(screen.getByText('Naziv je obavezan.')).toBeVisible()
    expect(screen.getByText('Trajanje je obavezno za uslugu.')).toBeVisible()
    change(/^Naziv/, '  Snack  '); change(/^Cena/, '120.5'); change(/^Trajanje/, '60')
    await user.click(screen.getByLabelText('Usluga zahteva fizički resurs'))
    await user.click(screen.getByRole('button', { name: 'Proizvod' }))
    expect(screen.queryByLabelText(/^Trajanje/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Kreiraj stavku' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(onSaved).toHaveBeenCalledOnce()
    expect(body).toMatchObject({ type: 'PRODUCT', name: 'Snack', price: 120.5, requiresResource: false })
    expect(body).not.toHaveProperty('durationMinutes')
  })

  it('updates with the original optimistic version and prevents duplicate submissions', async () => {
    let calls = 0
    server.use(http.patch('/api/v1/catalog/item-1', async ({ request }) => {
      calls++; expect(await request.json()).toMatchObject({ name: 'Updated', version: 3, durationMinutes: 90, requiresResource: false, description: 'New description' })
      await delay(60); return HttpResponse.json(testCatalogItem({ name: 'Updated', version: 4 }))
    }))
    const { onClose } = form(testCatalogItem()), user = userEvent.setup()
    change(/^Naziv/, 'Updated'); change(/^Trajanje/, '90'); change(/^Opis$/, 'New description')
    await user.click(screen.getByLabelText('Usluga zahteva fizički resurs'))
    await user.click(screen.getByRole('button', { name: 'Sačuvaj izmene' }))
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(calls).toBe(1)
  })

  it.each([
    { value: new File(['x'], 'bad.svg', { type: 'image/svg+xml' }), message: 'Izaberite sliku u PNG ili JPEG formatu.' },
    { value: new File([], 'empty.png', { type: 'image/png' }), message: 'Izabrani fajl je prazan.' },
    { value: new File(['123456789'], 'large.png', { type: 'image/png' }), message: /Slika može imati najviše/ },
  ])('rejects $value.name before uploading and allows clearing the invalid selection', async ({ value, message }) => {
    form(testCatalogItem(), true); const user = userEvent.setup()
    file(value)
    expect(screen.getByText(message)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sačuvaj sliku' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Očisti izbor slike' }))
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })

  it('keeps a successfully created item when image upload fails and retries using its refreshed version', async () => {
    let creates = 0, uploads = 0
    server.use(
      http.post('/api/v1/catalog', () => { creates++; return HttpResponse.json(testCatalogItem()) }),
      http.get('/api/v1/catalog/item-1', () => HttpResponse.json(testCatalogItem({ version: 7 }))),
      http.post('/api/v1/catalog/item-1/image', ({ request }) => {
        uploads++
        expect(new URL(request.url).searchParams.get('version')).toBe(uploads === 1 ? '3' : '7')
        return uploads === 1 ? HttpResponse.json({ message: 'Upload conflict' }, { status: 409 }) : HttpResponse.json(testCatalogItem({ version: 8, imageUrl: '/media/catalog.png' }))
      }),
    )
    const { onSaved, onClose } = form(), user = userEvent.setup()
    change(/^Naziv/, 'Game hour'); change(/^Cena/, '1200'); change(/^Trajanje/, '60')
    file(new File(['png'], 'image.png', { type: 'image/png' }))
    expect(await screen.findByAltText('Pregled izabrane slike')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Kreiraj stavku' }))
    expect(await screen.findByText('Podaci stavke su sačuvani; slanje slike nije potvrđeno.')).toBeVisible()
    expect(onClose).not.toHaveBeenCalled(); expect(screen.getByLabelText(/^Naziv/)).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Osveži verziju i trenutnu sliku' }))
    await screen.findByText('Verzija je osvežena. Proverite trenutnu sliku pre ponovnog slanja izabranog fajla.')
    await user.click(screen.getByRole('button', { name: 'Ponovo pošalji sliku' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(creates).toBe(1); expect(uploads).toBe(2); expect(onSaved).toHaveBeenCalledTimes(3)
  })

  it('requires explicit confirmation before discarding changed fields or an uploaded image choice', async () => {
    const { onClose } = form(), user = userEvent.setup()
    change(/^Naziv/, 'Unsaved')
    await user.click(screen.getByRole('button', { name: 'Otkaži' }))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog', { name: 'Odbaci unete podatke?' })).getByRole('button', { name: 'Odbaci' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

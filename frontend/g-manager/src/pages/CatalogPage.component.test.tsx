import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { roleCapabilities } from '../auth/capabilities'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import { CatalogPage } from './CatalogPage'

const item = (type: 'PRODUCT' | 'SERVICE') => ({ id: `${type.toLowerCase()}-1`, name: type === 'PRODUCT' ? 'Šampon' : 'Masaža',
  description: 'Opis', type, price: 1200, durationMinutes: type === 'SERVICE' ? 60 : null, active: true, imageUrl: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', version: 0,
  deletedAt: null, deletedBy: null, deletionReason: null })

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/catalog']}><Routes>
    <Route path="catalog" element={<CatalogPage />} />
    <Route path="my-orders" element={<p>Korpa</p>} />
    <Route path="my-reservations" element={<p>Zakazivanje</p>} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('CatalogPage role composition', () => {
  beforeEach(() => sessionStorage.clear())

  it('gives customers a simple active offer without management chrome and carries CTA selection', async () => {
    useAuthStore.setState({ user: authUser('CUSTOMER', { permissions: roleCapabilities.CUSTOMER }), accessToken: 'token', isInitializing: false })
    server.use(http.get('/api/v1/catalog', ({ request }) => {
      expect(new URL(request.url).searchParams.get('active')).toBeNull()
      return HttpResponse.json({ content: [item('PRODUCT'), item('SERVICE')], page: 0, size: 20, totalElements: 2, totalPages: 1 })
    }))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Katalog', level: 1 })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Nova stavka' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Sačuvani prikazi')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Izaberi stavku/)).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('link', { name: 'Dodaj u korpu' }))
    expect(await screen.findByText('Korpa')).toBeVisible()
    expect(sessionStorage.getItem('gmanager.catalog-selection')).toBe('product-1')
  })

  it('retains management filters, bulk selection and create dialog', async () => {
    useAuthStore.setState({ user: authUser('OWNER', { permissions: roleCapabilities.OWNER }), accessToken: 'token', isInitializing: false })
    server.use(
      http.get('/api/v1/catalog', () => HttpResponse.json({ content: [item('PRODUCT')], page: 0, size: 20, totalElements: 1, totalPages: 1 })),
      http.get('/api/v1/saved-views', () => HttpResponse.json([])),
    )
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Upravljanje katalogom', level: 1 })).toBeVisible()
    expect(screen.getByLabelText('Minimalna cena')).toBeVisible()
    expect(await screen.findByLabelText('Izaberi stavku Šampon')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Nova stavka' }))
    expect(screen.getByRole('dialog', { name: 'Nova stavka' })).toBeVisible()
  })
})

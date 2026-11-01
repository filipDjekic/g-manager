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
      const params = new URL(request.url).searchParams
      expect(params.get('active')).toBeNull()
      const content = [item('PRODUCT'), item('SERVICE')].filter(value => value.type === params.get('type'))
      return HttpResponse.json({ content, page: 0, size: 10, totalElements: content.length, totalPages: 1 })
    }))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Ponuda', level: 1 })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Nova stavka' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Sačuvani prikazi')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Izaberi stavku/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Proizvodi' }))
    const orderLink = await screen.findByRole('link', { name: 'Dodaj u korpu' })
    expect(orderLink).toHaveAttribute('href', '/my-orders?productId=product-1')
    await userEvent.click(orderLink)
    expect(await screen.findByText('Korpa')).toBeVisible()
  })

  it('retains management filters, bulk selection and create dialog', async () => {
    useAuthStore.setState({ user: authUser('OWNER', { permissions: roleCapabilities.OWNER }), accessToken: 'token', isInitializing: false })
    server.use(
      http.get('/api/v1/catalog', () => HttpResponse.json({ content: [item('SERVICE')], page: 0, size: 10, totalElements: 1, totalPages: 1 })),
      http.get('/api/v1/saved-views', () => HttpResponse.json([])),
    )
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Ponuda i cene', level: 1 })).toBeVisible()
    await userEvent.selectOptions(screen.getByLabelText('Cena'), 'range')
    expect(screen.getByLabelText('Minimalna cena (RSD)')).toBeVisible()
    expect(await screen.findByLabelText('Izaberi stavku Masaža')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Nova stavka' }))
    expect(screen.getByRole('dialog', { name: 'Nova stavka' })).toBeVisible()
  })
})

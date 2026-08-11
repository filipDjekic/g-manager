import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import { deleteDraft, loadDraft, saveDraft } from '../pwa/clientStorage'
import { MyOrdersPage } from './MyOrdersPage'

vi.mock('../pwa/clientStorage', () => ({
  loadDraft: vi.fn(), saveDraft: vi.fn(), deleteDraft: vi.fn(),
  cacheRead: vi.fn().mockResolvedValue(undefined), readCached: vi.fn().mockResolvedValue(null),
  purgePrivateData: vi.fn().mockResolvedValue(undefined),
}))

const emptyPage = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }
const product = { id: 'product-1', name: 'Šampon', description: null, type: 'PRODUCT', price: 150,
  durationMinutes: null, active: true, imageUrl: null, createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', version: 0, deletedAt: null, deletedBy: null, deletionReason: null }

function renderPage() {
  return render(<MemoryRouter><MyOrdersPage /></MemoryRouter>)
}

function catalog(items = [product]) {
  return http.get('/api/v1/catalog', () => HttpResponse.json({ ...emptyPage, size: 100, content: items,
    totalElements: items.length, totalPages: items.length ? 1 : 0 }))
}

describe('MyOrdersPage persistent checkout', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('CUSTOMER'), accessToken: 'token', isInitializing: false })
    vi.mocked(loadDraft).mockReset().mockResolvedValue({ 'product-1': 2 })
    vi.mocked(saveDraft).mockReset().mockResolvedValue(undefined)
    vi.mocked(deleteDraft).mockReset().mockResolvedValue(undefined)
  })

  it('restores the cart, uses current catalog price and submits only once with server-confirmed total', async () => {
    let creates = 0
    server.use(catalog(), http.get('/api/v1/orders/me', () => HttpResponse.json(emptyPage)),
      http.post('/api/v1/orders', async ({ request }) => {
        creates += 1
        expect(await request.json()).toEqual({ items: [{ productId: 'product-1', quantity: 2 }] })
        await delay(30)
        return HttpResponse.json({ id: 'order-1', customerId: 'customer-1', handledBy: null, status: 'CREATED',
          totalPrice: 300, items: [{ productId: 'product-1', quantity: 2, unitPrice: 150, lineTotal: 300 }],
          createdAt: '2026-08-11T10:00:00Z', updatedAt: '2026-08-11T10:00:00Z', version: 0 }, { status: 201 })
      }))
    renderPage()

    expect(await screen.findByLabelText('Količina za Šampon')).toHaveValue(2)
    expect(screen.getAllByText('300.00 RSD')).toHaveLength(2)
    const submit = screen.getByRole('button', { name: 'Pošalji narudžbinu' })
    await Promise.all([userEvent.click(submit), userEvent.click(submit)])
    expect(await screen.findByText(/Server je potvrdio ukupno 300.00 RSD/)).toBeVisible()
    expect(creates).toBe(1)
    expect(deleteDraft).toHaveBeenCalled()
  })

  it('removes an inactive persisted product and keeps cart recoverable after conflict', async () => {
    vi.mocked(loadDraft).mockResolvedValue({ inactive: 1, 'product-1': 1 })
    let creates = 0
    const keys: string[] = []
    server.use(catalog(), http.get('/api/v1/orders/me', () => HttpResponse.json(emptyPage)),
      http.post('/api/v1/orders', async ({ request }) => {
        creates += 1
        keys.push(request.headers.get('Idempotency-Key') ?? '')
        if (creates === 1) return HttpResponse.json({ message: 'Conflict' }, { status: 409 })
        return HttpResponse.json({ id: 'order-2', customerId: 'customer-1', handledBy: null, status: 'CREATED',
          totalPrice: 150, items: [{ productId: 'product-1', quantity: 1, unitPrice: 150, lineTotal: 150 }],
          createdAt: '2026-08-11T10:00:00Z', updatedAt: '2026-08-11T10:00:00Z', version: 0 }, { status: 201 })
      }))
    renderPage()

    expect(await screen.findByText('Nedostupni proizvodi su uklonjeni iz korpe.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Pošalji narudžbinu' }))
    expect(await screen.findByText(/Podaci su promenjeni/)).toBeVisible()
    expect(screen.getByText('Šampon × 1')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Pošalji narudžbinu' }))
    expect(await screen.findByText(/Server je potvrdio ukupno 150.00 RSD/)).toBeVisible()
    expect(keys[0]).not.toBe(keys[1])
  })
})

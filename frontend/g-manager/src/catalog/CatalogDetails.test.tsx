import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createRef } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { testCatalogItem } from '../test/catalogFixtures'
import { server } from '../test/server'
import type { CatalogItem } from '../types/catalog.types'
import { CatalogDetails } from './CatalogDetails'

function details(item: CatalogItem = testCatalogItem()) {
  const onAction = vi.fn(), onClose = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>
    <CatalogDetails item={item} permissions={{ manage: true, remove: true, restore: true, order: true }} canReadResources busy={false} returnFocusRef={createRef()} onAction={onAction} onClose={onClose} />
  </MemoryRouter></QueryClientProvider>)
  return { onAction, onClose }
}
describe('catalog details and resource conditions', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false })
    server.use(http.get('/api/v1/catalog/item-1', () => HttpResponse.json(testCatalogItem())))
  })

  it('navigates resource tabs by keyboard and explains each reservation restriction', async () => {
    server.use(http.get('/api/v1/resources/catalog-services/item-1', () => HttpResponse.json([
      null, 'Service is inactive', 'Station is unavailable for booking', 'Resource or location is inactive or not bookable', 'Unknown restriction',
    ].map((reason, index) => ({ id: `pc-${index}`, name: `PC ${index}`, code: `PC-${index}`, type: 'GAMING_PC', locationName: 'Arena', areaName: index ? 'PC room' : null, available: !reason, unavailabilityReason: reason })))))
    const { onAction } = details(), user = userEvent.setup()
    const basic = screen.getByRole('tab', { name: 'Osnovne informacije' })
    expect(screen.getByText('An hour in the arena')).toBeVisible()
    fireEvent.keyDown(basic, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Resursi' })).toHaveFocus()
    expect(await screen.findByText('Usluga je neaktivna.')).toBeVisible()
    expect(screen.getByText('Stanica trenutno nije dostupna za rezervisanje.')).toBeVisible()
    expect(screen.getByText('Resurs, zona ili lokal su neaktivni ili resurs nije moguće rezervisati.')).toBeVisible()
    expect(screen.getByText('Resurs trenutno nije moguće rezervisati.')).toBeVisible()
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(5)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Resursi' }), { key: 'Home' })
    expect(basic).toHaveFocus(); expect(basic).toHaveAttribute('aria-selected', 'true')
    for (const [name, action] of [['Izmeni', 'EDIT'], ['Promeni sliku', 'IMAGE'], ['Deaktiviraj', 'DEACTIVATE'], ['Obriši', 'DELETE']]) {
      await user.click(screen.getByRole('button', { name }))
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'item-1' }), action, expect.any(HTMLButtonElement))
    }
    expect(screen.getByRole('link', { name: 'Zakaži termin' })).toHaveAttribute('href', '/my-reservations?booking=new&serviceId=item-1')
  })

  it('keeps the last detail snapshot when refresh fails and retries an empty resource response', async () => {
    let calls = 0
    server.use(http.get('/api/v1/catalog/item-1', () => HttpResponse.error()),
      http.get('/api/v1/resources/catalog-services/item-1', () => ++calls === 1 ? HttpResponse.error() : HttpResponse.json([])))
    details(); const user = userEvent.setup()
    expect(await screen.findByText('Detalji nisu osveženi')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Resursi' }))
    expect(await screen.findByText('Resurse nije moguće učitati.')).toBeVisible()
    await user.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await screen.findByText('Nema povezanih resursa')).toBeVisible()
  })

  it('shows deleted products without fetching protected live resources and offers restoration', async () => {
    const item = testCatalogItem({ type: 'PRODUCT', deletedAt: '2028-02-01T10:00:00Z', deletionReason: 'No longer sold', durationMinutes: null, description: null })
    const { onAction, onClose } = details(item), user = userEvent.setup()
    expect(screen.getByRole('dialog', { name: 'Detalji proizvoda' })).toBeVisible()
    expect(screen.getByText('No longer sold')).toBeVisible()
    expect(screen.getByText('Opis nije dodat.')).toBeVisible()
    expect(screen.queryByRole('tab', { name: 'Resursi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dodaj u korpu' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Vrati stavku' }))
    expect(onAction).toHaveBeenCalledWith(item, 'RESTORE', expect.any(HTMLButtonElement))
    await user.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

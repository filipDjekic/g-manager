import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { CustomerPicker } from './CustomerPicker'

const active = { id: 'active', name: 'Ada Customer', email: 'ada@example.test', active: true }
const inactive = { id: 'inactive', name: 'Inactive customer', email: 'inactive@example.test', active: false }
function picker(initial = '') {
  const onChange = vi.fn()
  function Selected() { const [value, setValue] = useState(initial); return <CustomerPicker required value={value} onChange={(id, name) => { setValue(id); onChange(id, name) }} /> }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Selected /></QueryClientProvider>)
  return onChange
}
describe('required customer selection', () => {
  it('blocks inactive accounts and searches normalized names before choosing a verified active customer', async () => {
    const queries: URLSearchParams[] = []
    server.use(http.get('/api/v1/customers/:id', ({ params }) => HttpResponse.json({ customer: params.id === 'active' ? active : inactive })),
      http.get('/api/v1/customers', ({ request }) => { queries.push(new URL(request.url).searchParams); return HttpResponse.json({ content: [active, inactive], totalPages: 1, totalElements: 2 }) }))
    const onChange = picker('inactive'), user = userEvent.setup()
    expect(await screen.findByText('Klijent je deaktiviran. Izaberite aktivnog klijenta za rezervaciju.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Promeni klijenta: Inactive customer' }))
    const dialog = screen.getByRole('dialog', { name: 'Izbor klijenta' })
    expect(await within(dialog).findByRole('button', { name: 'Izaberi klijenta Inactive customer' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Pretraži po imenu, prezimenu ili mejlu'), '  Ada   Customer  ')
    await waitFor(() => expect(queries.at(-1)?.get('search')).toBe('Ada Customer'))
    await user.click(within(dialog).getByRole('button', { name: 'Izaberi klijenta Ada Customer' }))
    expect(onChange).toHaveBeenCalledWith('active', 'Ada Customer')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Klijent je deaktiviran. Izaberite aktivnog klijenta za rezervaciju.')).not.toBeInTheDocument())
  })

  it('recovers failed detail and search requests without silently selecting an account', async () => {
    let details = 0, lists = 0
    server.use(http.get('/api/v1/customers/active', () => ++details === 1 ? HttpResponse.error() : HttpResponse.json({ customer: active })),
      http.get('/api/v1/customers', () => ++lists === 1 ? HttpResponse.error() : HttpResponse.json({ content: [], totalPages: 0, totalElements: 0 })))
    const onChange = picker('active'), user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Pokušaj ponovo' }))
    const opener = await screen.findByRole('button', { name: 'Promeni klijenta: Ada Customer' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await within(dialog).findByText('Nema klijenata')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Zatvori' }))
    expect(opener).toHaveFocus(); expect(onChange).not.toHaveBeenCalled()
  })
})

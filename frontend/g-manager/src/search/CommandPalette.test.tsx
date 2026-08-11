import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'

vi.mock('./useGlobalSearch', () => ({
  useGlobalSearch: () => ({
    results: [{ type: 'ORDER', id: '123', title: 'Narudžbina 123', subtitle: 'CREATED', url: '/my-orders?focus=123', action: { kind: 'NAVIGATE', label: 'Otvori narudžbinu', url: '/my-orders?focus=123' }, favorite: false }],
    favorites: [], recents: [], loading: false, error: '',
  }),
}))
vi.mock('../api/searchApi', () => ({
  searchApi: { remember: vi.fn().mockResolvedValue(undefined), removeFavorite: vi.fn() },
}))

describe('CommandPalette', () => {
  it('opens from the documented shortcut, focuses the combobox and supports keyboard selection', async () => {
    const user = userEvent.setup()
    const { container } = render(<MemoryRouter><CommandPalette /></MemoryRouter>)

    await user.keyboard('{Control>}k{/Control}')
    const input = screen.getByRole('combobox', { name: 'Pretraži G-Manager' })
    expect(input).toHaveFocus()
    await user.type(input, '123')
    expect(container.querySelector('#search-result-ORDER-123')).toHaveAttribute('aria-current', 'true')
    expect((await axe(container)).violations.filter(({ impact }) => impact === 'serious' || impact === 'critical').map(({ id }) => id)).toEqual([])

    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

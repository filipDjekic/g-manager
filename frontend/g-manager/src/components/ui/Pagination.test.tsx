import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './index'

describe('shared pagination', () => {
  it('recovers after the last page disappears and never displays an inverted result range', () => {
    const change = vi.fn()
    render(<Pagination numbered page={4} totalPages={2} totalElements={11} pageSize={10} onPageChange={change} />)
    expect(change).toHaveBeenCalledWith(1)
    expect(screen.getByText(/11-11 od 11/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sledeća' })).toBeDisabled()
  })

  it('supports common page sizes and blocks interactions while loading', async () => {
    const change = vi.fn(), size = vi.fn(), user = userEvent.setup()
    const view = render(<Pagination page={0} totalPages={3} totalElements={30} onPageChange={change} onPageSizeChange={size} />)
    await user.selectOptions(screen.getByLabelText('Po stranici'), '100')
    expect(size).toHaveBeenCalledWith(100)
    view.rerender(<Pagination page={0} totalPages={3} loading onPageChange={change} onPageSizeChange={size} />)
    expect(screen.getByRole('button', { name: 'Sledeća' })).toBeDisabled()
    expect(screen.getByLabelText('Po stranici')).toBeDisabled()
  })
})

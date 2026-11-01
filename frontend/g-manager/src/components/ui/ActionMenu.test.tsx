import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionMenu } from './ActionMenu'

describe('ActionMenu scrolling and keyboard access', () => {
  it('keeps actions available when a queued scroll event arrives after opening', async () => {
    const user = userEvent.setup(), action = vi.fn()
    render(<ActionMenu label="Order actions" actions={[{ label: 'Take order', onClick: action }]} />)
    const trigger = screen.getByRole('button', { name: 'Order actions' })
    await user.click(trigger)
    // A browser can deliver the trigger's scroll-into-view event after the click.
    fireEvent.scroll(document)
    const item = screen.getByRole('menuitem', { name: 'Take order' })
    expect(item).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(action).toHaveBeenCalledWith(trigger)
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes when scrolling actually moves the trigger', async () => {
    const user = userEvent.setup()
    render(<ActionMenu label="Order actions" actions={[{ label: 'Take order', onClick: vi.fn() }]} />)
    const trigger = screen.getByRole('button', { name: 'Order actions' })
    const position = vi.spyOn(trigger, 'getBoundingClientRect')
    position.mockReturnValue({ top: 200, bottom: 240, left: 100, right: 140, width: 40, height: 40, x: 100, y: 200, toJSON: () => ({}) })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeVisible()
    position.mockReturnValue({ ...trigger.getBoundingClientRect(), top: 150, bottom: 190, y: 150 })
    fireEvent.scroll(document)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

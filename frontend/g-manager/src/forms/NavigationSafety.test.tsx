import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createMemoryRouter, Link, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { NavigationSafety } from './NavigationSafety'
import { useDirtyGuard } from './useDirtyGuard'

function Editor({ pending = false, handoff = false }: { pending?: boolean; handoff?: boolean }) {
  const [dirty, setDirty] = useState(pending || handoff)
  useDirtyGuard(dirty, { pending, retainedResult: handoff })
  const location = useLocation()
  return <><button onClick={() => setDirty(true)}>Edit form</button><Link to="/done">Leave</Link><Link to="?filter=active">Filter</Link><output aria-label="Location">{location.search}</output></>
}
function app(options = {}) {
  const router = createMemoryRouter([{ element: <><NavigationSafety /><Outlet /></>, children: [
    { path: '/editor', element: <Editor {...options} /> }, { path: '/done', element: <h1>Destination</h1> },
  ] }], { initialEntries: ['/editor'] })
  render(<RouterProvider router={router} />)
  return router
}
describe('navigation with unsaved or unacknowledged work', () => {
  beforeEach(() => useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false }))

  it('loads the confirmation only when blocked, can stay, and proceeds after explicit confirmation', async () => {
    app(); const user = userEvent.setup()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit form' }))
    await user.click(screen.getByRole('link', { name: 'Leave' }))
    let dialog = await screen.findByRole('dialog', { name: 'Napusti stranicu?' })
    await user.click(within(dialog).getByRole('button', { name: 'Ostani na stranici' }))
    expect(screen.queryByRole('heading', { name: 'Destination' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Leave' }))
    dialog = await screen.findByRole('dialog', { name: 'Napusti stranicu?' })
    await user.click(within(dialog).getByRole('button', { name: 'Napusti stranicu' }))
    expect(await screen.findByRole('heading', { name: 'Destination' })).toBeVisible()
  })

  it('permits query-only navigation for a dirty form while retaining the edited page', async () => {
    app(); const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Edit form' }))
    await user.click(screen.getByRole('link', { name: 'Filter' }))
    await waitFor(() => expect(screen.getByLabelText('Location')).toHaveTextContent('?filter=active'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    { pending: true, title: 'Prethodni zahtev čeka proveru' },
    { handoff: true, title: 'Sačuvajte jednokratni rezultat' },
  ])('protects $title even when only query context changes', async ({ title, ...options }) => {
    app(options); const user = userEvent.setup()
    await user.click(screen.getByRole('link', { name: 'Filter' }))
    const dialog = await screen.findByRole('dialog', { name: title })
    expect(within(dialog).getByRole('button', { name: 'Napusti stranicu' })).toBeDisabled()
    expect(screen.getByLabelText('Location')).toHaveTextContent('')
    await user.click(within(dialog).getByRole('button', { name: 'Ostani na stranici' }))
    expect(screen.getByRole('link', { name: 'Leave' })).toBeVisible()
  })
})

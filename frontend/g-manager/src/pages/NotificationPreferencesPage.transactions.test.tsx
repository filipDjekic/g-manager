import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationApi } from '../api/notificationApi'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import type { NotificationPreference } from '../types/notification.types'
import { NotificationPreferencesPage } from './NotificationPreferencesPage'

vi.mock('../api/notificationApi', () => ({ notificationApi: { preferences: vi.fn(), savePreference: vi.fn() } }))
const security: NotificationPreference = { type: 'SECURITY_SESSION_STARTED', mandatory: true, inAppEnabled: true, emailEnabled: true }
const optional: NotificationPreference[] = ['RESERVATION_CREATED', 'ORDER_CREATED'].map(type => ({ type: type as NotificationPreference['type'], mandatory: false, inAppEnabled: true, emailEnabled: false }))
function page() {
  return render(<MemoryRouter initialEntries={['/home', '/preferences']}><Routes>
    <Route path="home" element={<p>Home</p>} /><Route path="preferences" element={<NotificationPreferencesPage />} />
  </Routes></MemoryRouter>)
}
describe('notification preference transactions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useAuthStore.setState({ user: authUser('CUSTOMER'), accessToken: 'token', isInitializing: false })
    vi.mocked(notificationApi.preferences).mockResolvedValue([security, ...optional])
    vi.mocked(notificationApi.savePreference).mockImplementation(async value => value)
  })

  it('changes both optional types through a group switch and acknowledges only the changed preferences', async () => {
    page(); const user = userEvent.setup()
    const email = await screen.findByRole('checkbox', { name: 'Email: sva neobavezna obaveštenja' })
    await user.click(email)
    expect(email).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Sačuvaj promene' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sačuvaj promene' })).not.toBeInTheDocument())
    expect(notificationApi.savePreference).toHaveBeenCalledTimes(2)
    optional.forEach(value => expect(notificationApi.savePreference).toHaveBeenCalledWith({ ...value, emailEnabled: true }))
    expect(screen.getByText('Nema nesačuvanih izmena.')).toBeVisible()
  })

  it('retains failed rows for retry after a partially acknowledged save', async () => {
    let fail = true
    vi.mocked(notificationApi.savePreference).mockImplementation(async value => {
      if (value.type === 'ORDER_CREATED' && fail) throw new Error('temporary')
      return value
    })
    page(); const user = userEvent.setup()
    await user.click(await screen.findByRole('checkbox', { name: 'Email: sva neobavezna obaveštenja' }))
    await user.click(screen.getByRole('button', { name: 'Sačuvaj promene' }))
    expect(await screen.findByText(/Sačuvano je 1 od 2/)).toBeVisible()
    expect(screen.getByText('Nesačuvane izmene: 1.')).toBeVisible()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Sačuvaj promene' }))
    await waitFor(() => expect(screen.getByText('Nema nesačuvanih izmena.')).toBeVisible())
    expect(notificationApi.savePreference).toHaveBeenCalledTimes(3)
    expect(notificationApi.savePreference).toHaveBeenLastCalledWith({ ...optional[1], emailEnabled: true })
  })

  it('requires confirmation to discard individual channel changes and navigates back afterwards', async () => {
    page(); const user = userEvent.setup()
    const table = await screen.findByRole('table')
    const switchControl = within(table).getAllByRole('checkbox').find(value => !value.hasAttribute('disabled'))!
    await user.click(switchControl)
    await user.click(screen.getByRole('button', { name: 'Odbaci izmene' }))
    const dialog = screen.getByRole('dialog', { name: 'Odbaci nesačuvane izmene?' })
    await user.click(within(dialog).getByRole('button', { name: 'Zadrži izmene' }))
    expect(screen.getByText('Nesačuvane izmene: 1.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Odbaci izmene' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Odbaci izmene' }))
    expect(screen.getByText('Nema nesačuvanih izmena.')).toBeVisible()
    expect(notificationApi.savePreference).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Nazad' }))
    expect(screen.getByText('Home')).toBeVisible()
  })

  it('recovers from a load error and supports an empty preference response', async () => {
    vi.mocked(notificationApi.preferences).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    page(); const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await screen.findByText('Trenutno nema dostupnih podešavanja obaveštenja.')).toBeVisible()
  })

  it('ignores an old account response after the actor changes', async () => {
    let resolve!: (value: NotificationPreference[]) => void
    vi.mocked(notificationApi.preferences).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    page()
    await act(async () => { useAuthStore.setState({ user: authUser('OWNER') }) })
    expect(await screen.findByRole('table')).toBeVisible()
    await act(async () => resolve([]))
    expect(screen.getByRole('table')).toBeVisible()
    expect(screen.queryByText('Trenutno nema dostupnih podešavanja obaveštenja.')).not.toBeInTheDocument()
  })

  it('denies access without a profile permission before requesting preferences', () => {
    useAuthStore.setState({ user: authUser('CUSTOMER', { permissions: [] }) })
    page()
    expect(screen.getByText('Pristup nije dozvoljen')).toBeVisible()
    expect(notificationApi.preferences).not.toHaveBeenCalled()
  })
})

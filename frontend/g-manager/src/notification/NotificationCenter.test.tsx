import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationApi } from '../api/notificationApi'
import { NotificationCenter } from './NotificationCenter'

vi.mock('../api/notificationApi', () => ({
  notificationApi: { list: vi.fn(), read: vi.fn(), readAll: vi.fn(), open: vi.fn() },
  connectNotificationStream: vi.fn((_event, state) => { state('connected'); return vi.fn() }),
}))

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.mocked(notificationApi.list).mockResolvedValue({ unreadCount: 1, notifications: [{ id: 'n1', type: 'ORDER_STATUS_CHANGED',
      priority: 'NORMAL', title: 'Promenjen status', body: 'Narudžbina je završena.', read: false, createdAt: '2026-08-10T10:00:00Z' }] })
    vi.mocked(notificationApi.read).mockResolvedValue({ id: 'n1', type: 'ORDER_STATUS_CHANGED', priority: 'NORMAL', title: '', body: '', read: true, createdAt: '' })
  })
  it('shows unread state, supports keyboard reading and has no serious accessibility violations', async () => {
    const user = userEvent.setup(); const { container } = render(<MemoryRouter><NotificationCenter /></MemoryRouter>)
    const bell = await screen.findByRole('button', { name: 'Obaveštenja, 1 nepročitanih' }); await user.click(bell)
    expect(screen.getByText('Narudžbina je završena.')).toBeVisible(); await user.click(screen.getByRole('button', { name: 'Označi pročitano' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Obaveštenja, 0 nepročitanih' })).toBeVisible())
    expect((await axe(container)).violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toHaveLength(0)
  })
  it('rolls optimistic read state back when persistence fails', async () => {
    vi.mocked(notificationApi.read).mockRejectedValueOnce(new Error('offline')); const user = userEvent.setup()
    render(<MemoryRouter><NotificationCenter /></MemoryRouter>); await user.click(await screen.findByRole('button', { name: 'Obaveštenja, 1 nepročitanih' }))
    await user.click(screen.getByRole('button', { name: 'Označi pročitano' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Status čitanja nije sačuvan.')
    expect(screen.getByRole('button', { name: 'Obaveštenja, 1 nepročitanih' })).toBeVisible()
  })
})

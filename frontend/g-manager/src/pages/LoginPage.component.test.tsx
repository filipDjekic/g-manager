import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authResponse } from '../test/fixtures'
import { server } from '../test/server'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  beforeEach(() => useAuthStore.setState({ user: null, accessToken: null, isInitializing: false }))

  it('supports keyboard login and exposes no serious accessibility violations', async () => {
    server.use(http.post('/api/v1/auth/login', () => HttpResponse.json(authResponse('CUSTOMER'))))
    const user = userEvent.setup()
    const { container } = render(<MemoryRouter><LoginPage /></MemoryRouter>)

    await user.type(screen.getByLabelText('Email'), 'customer@example.test')
    await user.type(screen.getByLabelText('Lozinka'), 'Test-password-123!')
    await user.tab()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(useAuthStore.getState().user?.role).toBe('CUSTOMER'))
    const results = await axe(container)
    expect(results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toHaveLength(0)
  })

  it('renders server error state and keeps credentials out of the message', async () => {
    server.use(http.post('/api/v1/auth/login', () => HttpResponse.json({
      status: 401, message: 'Pogrešni kredencijali.', requestId: 'request-test-1',
    }, { status: 401 })))
    const user = userEvent.setup()
    render(<MemoryRouter><LoginPage /></MemoryRouter>)

    await user.type(screen.getByLabelText('Email'), 'wrong@example.test')
    await user.type(screen.getByLabelText('Lozinka'), 'Wrong-password-123!')
    await user.click(screen.getByRole('button', { name: 'Prijavi se' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Pogrešni kredencijali.')
    expect(alert).not.toHaveTextContent('Wrong-password-123!')
  })
})

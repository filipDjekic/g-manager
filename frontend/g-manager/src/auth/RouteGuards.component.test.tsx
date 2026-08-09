import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { authUser } from '../test/fixtures'
import { CapabilityGuard } from './CapabilityGuard'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuthStore } from './authStore'

function Harness() {
  return <MemoryRouter initialEntries={['/private']}><Routes>
    <Route path="/login" element={<p>Login screen</p>} />
    <Route path="/unauthorized" element={<p>Forbidden screen</p>} />
    <Route element={<ProtectedRoute />}>
      <Route element={<CapabilityGuard anyOf={['AUDIT_READ']} />}>
        <Route path="/private" element={<p>Protected content</p>} />
      </Route>
    </Route>
  </Routes></MemoryRouter>
}

describe('route guards', () => {
  beforeEach(() => useAuthStore.setState({ user: null, accessToken: null, isInitializing: false }))

  it('shows initialization, redirects anonymous users and rejects missing permission', () => {
    useAuthStore.setState({ isInitializing: true })
    const view = render(<Harness />)
    expect(screen.getByText(/Provera sesije/)).toBeInTheDocument()

    view.unmount()
    useAuthStore.setState({ isInitializing: false })
    const anonymous = render(<Harness />)
    expect(screen.getByText('Login screen')).toBeInTheDocument()

    anonymous.unmount()
    useAuthStore.setState({ user: authUser('CUSTOMER') })
    render(<Harness />)
    expect(screen.getByText('Forbidden screen')).toBeInTheDocument()
  })

  it('renders protected success state for an authorized role', () => {
    useAuthStore.setState({ user: authUser('OWNER') })
    render(<Harness />)
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })
})

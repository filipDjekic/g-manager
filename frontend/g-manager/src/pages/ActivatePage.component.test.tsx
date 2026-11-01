import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { ActivatePage } from './ActivatePage'

function LoginResult() {
  const location = useLocation()
  return <p>{location.state?.activated ? 'Nalog aktiviran' : 'Prijava'}</p>
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/activate']}><Routes>
    <Route path="/activate" element={<ActivatePage />} />
    <Route path="/login" element={<LoginResult />} />
  </Routes></MemoryRouter>)
}

async function fillForm(code: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email adresa'), 'customer@example.test')
  await user.type(screen.getByLabelText('Aktivacioni kod'), code)
  await user.type(screen.getByLabelText('Nova lozinka'), 'CustomerPass1!')
  await user.type(screen.getByLabelText('Potvrda lozinke'), 'CustomerPass1!')
  return user
}

describe('customer activation', () => {
  it('normalizes and limits code entry and preserves password setup and success navigation', async () => {
    const activate = vi.fn()
    server.use(http.post('/api/v1/auth/activate', async ({ request }) => {
      activate(await request.json())
      return new HttpResponse(null, { status: 204 })
    }))
    renderPage()
    const user = await fillForm('a7k2more')
    const code = screen.getByLabelText('Aktivacioni kod')
    expect(code).toHaveValue('A7K2')
    fireEvent.change(code, { target: { value: 'a!7 k2' } })
    expect(code).toHaveValue('A7K2')
    await user.click(screen.getByRole('button', { name: 'Aktiviraj nalog' }))
    expect(await screen.findByText('Nalog aktiviran')).toBeVisible()
    expect(activate).toHaveBeenCalledExactlyOnceWith({ email: 'customer@example.test', activationSecret: 'A7K2', password: 'CustomerPass1!' })
  })

  it('prevents short codes from reaching the API', async () => {
    const activate = vi.fn()
    server.use(http.post('/api/v1/auth/activate', () => { activate(); return new HttpResponse(null, { status: 204 }) }))
    renderPage()
    const user = await fillForm('a7k')
    await user.click(screen.getByRole('button', { name: 'Aktiviraj nalog' }))
    expect(await screen.findByText('Aktivacioni kod mora imati tačno 4 slova ili cifre.')).toBeVisible()
    expect(activate).not.toHaveBeenCalled()
  })

  it('shows the generic invalid-code message and permits retry', async () => {
    server.use(http.post('/api/v1/auth/activate', () => HttpResponse.json({
      message: 'Activation code is invalid or expired',
    }, { status: 400 })))
    renderPage()
    const user = await fillForm('a7k2')
    await user.click(screen.getByRole('button', { name: 'Aktiviraj nalog' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Aktivacioni kod nije važeći ili je istekao.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aktiviraj nalog' })).toBeEnabled())
  })
})

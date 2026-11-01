import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import type { CustomerListItem } from '../types/customer.types'
import { CustomerFormDialog } from './CustomerFormDialog'

const customer: CustomerListItem = { id: 'customer-1', name: 'Ada', email: 'ada@example.test', active: true, registeredAt: '2028-01-01T10:00:00Z', reservationCount: 0, completedAppointmentCount: 0, orderCount: 0, completedOrderCount: 0, completedOrderRevenue: 0, lastActivityAt: null, version: 3 }
function form(existing = false) {
  const onSaved = vi.fn(), onClose = vi.fn(), onContinue = vi.fn()
  const view = render(<CustomerFormDialog customer={existing ? customer : undefined} onSaved={onSaved} onClose={onClose} onContinue={onContinue} />)
  return { ...view, onSaved, onClose, onContinue }
}
describe('customer onboarding and profile persistence', () => {
  beforeEach(() => useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false }))

  it('keeps the one-time activation code in the dialog until it is handed off', async () => {
    const secret = crypto.randomUUID()
    server.use(http.post('/api/v1/customers', async ({ request }) => {
      expect(await request.json()).toEqual({ name: 'New customer', email: 'new@example.test' })
      return HttpResponse.json({ ...customer, name: 'New customer', email: 'new@example.test', activationSecret: secret, activationExpiresAt: '2028-03-16T10:00:00Z' })
    }))
    const { onSaved, onClose, onContinue } = form(), user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Kreiraj klijenta' })).toBeDisabled()
    await user.type(screen.getByLabelText('Ime i prezime'), ' New customer ')
    await user.type(screen.getByLabelText('Email adresa'), 'new@example.test')
    await user.click(screen.getByRole('button', { name: 'Kreiraj klijenta' }))
    const code = await screen.findByLabelText('Aktivacioni kod')
    expect(code).toHaveValue(secret); expect(code).toHaveFocus(); expect(onSaved).toHaveBeenCalledOnce()
    expect(JSON.stringify(localStorage)).not.toContain(secret); expect(JSON.stringify(sessionStorage)).not.toContain(secret)
    await user.click(screen.getByRole('button', { name: 'Kopiraj kod' }))
    expect(await screen.findByText('Kod je kopiran. Predajte ga klijentu.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Kod je predat - nastavi sesiju' }))
    expect(onContinue).toHaveBeenCalledWith({ id: customer.id, name: 'New customer', email: 'new@example.test' })
    expect(screen.queryByLabelText('Aktivacioni kod')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('updates using the original version, prevents duplicate requests and retries a rejected save', async () => {
    let calls = 0
    server.use(http.patch('/api/v1/customers/customer-1', async ({ request }) => {
      calls++; expect(await request.json()).toEqual({ name: 'Ada Updated', email: customer.email, version: 3 })
      await delay(50)
      return calls === 1 ? HttpResponse.json({ message: 'Concurrent profile change' }, { status: 409 }) : HttpResponse.json(customer)
    }))
    const { onSaved, onClose } = form(true), user = userEvent.setup()
    fireEvent.change(screen.getByLabelText('Ime i prezime'), { target: { value: ' Ada Updated ' } })
    await user.click(screen.getByRole('button', { name: 'Sačuvaj podatke' })); fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Concurrent profile change')
    expect(calls).toBe(1); expect(onSaved).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sačuvaj podatke' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(onSaved).toHaveBeenCalledOnce(); expect(calls).toBe(2)
  })

  it('requires explicit acknowledgement before closing an unrepeatable activation code', async () => {
    server.use(http.post('/api/v1/customers', () => HttpResponse.json({ ...customer, activationSecret: crypto.randomUUID(), activationExpiresAt: '2028-03-16T10:00:00Z' })))
    const { onClose } = form(), user = userEvent.setup()
    await user.type(screen.getByLabelText('Ime i prezime'), 'Ada')
    await user.type(screen.getByLabelText('Email adresa'), customer.email)
    await user.click(screen.getByRole('button', { name: 'Kreiraj klijenta' }))
    await screen.findByLabelText('Aktivacioni kod')
    await user.click(screen.getAllByRole('button', { name: 'Zatvori' })[0])
    expect(onClose).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog', { name: 'Da li je kod predat klijentu?' })).getByRole('button', { name: 'Kod je predat - zatvori' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

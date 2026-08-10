import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import {
  Breadcrumbs, Button, Card, Drawer, EmptyState, ErrorState, FormField, Input,
  Modal, PageHeader, Select, Skeleton, TableShell, ToastProvider,
} from './index'
import { useToast } from './toastContext'

function ToastProbe() {
  const toast = useToast()
  return <Button onClick={() => toast('Sačuvano', 'success')}>Prikaži poruku</Button>
}

function ModalFocusProbe() {
  const [open, setOpen] = useState(false)
  return <><Button onClick={() => setOpen(true)}>Otvori detalje</Button>
    <Modal open={open} title="Detalji" onClose={() => setOpen(false)}>
      <Input aria-label="Napomena" /><Button onClick={() => setOpen(false)}>Sačuvaj</Button>
    </Modal></>
}

describe('UI component system', () => {
  it('supports interaction states for modal, drawer and toast', async () => {
    const user = userEvent.setup()
    const closeModal = vi.fn()
    const closeDrawer = vi.fn()
    render(<ToastProvider>
      <Button loading>Čuvanje</Button>
      <Modal open title="Potvrda" onClose={closeModal}><p>Sadržaj</p></Modal>
      <Drawer open title="Meni" onClose={closeDrawer}><a href="/">Početna</a></Drawer>
      <ToastProbe />
    </ToastProvider>)

    expect(screen.getByRole('button', { name: 'Čuvanje' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(closeModal).toHaveBeenCalled()
    expect(closeDrawer).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Prikaži poruku' }))
    expect(screen.getByText('Sačuvano')).toBeVisible()
  })

  it('renders the complete representative catalog without serious accessibility violations', async () => {
    const { container } = render(<main>
      <PageHeader title="Komponente" breadcrumbs={<Breadcrumbs items={[{ label: 'Početna', href: '/' }, { label: 'Komponente' }]} />} />
      <Card><FormField label="Naziv" htmlFor="name" hint="Obavezno polje"><Input id="name" /></FormField>
        <FormField label="Tip" htmlFor="type"><Select id="type"><option>Proizvod</option></Select></FormField>
        <Button>Sačuvaj</Button><Button variant="secondary">Odustani</Button><Button variant="danger">Obriši</Button></Card>
      <TableShell label="Primer tabele"><table><thead><tr><th>Naziv</th></tr></thead><tbody><tr><td>Primer</td></tr></tbody></table></TableShell>
      <Skeleton /><EmptyState title="Nema rezultata" /><ErrorState message="Bezbedna poruka" />
    </main>)
    const results = await axe(container)
    expect(results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toHaveLength(0)
    expect(container).toMatchSnapshot()
  })

  it('traps dialog focus and restores it to the opener', async () => {
    const user = userEvent.setup()
    render(<ModalFocusProbe />)
    const opener = screen.getByRole('button', { name: 'Otvori detalje' })
    await user.click(opener)
    const close = screen.getByRole('button', { name: 'Zatvori' })
    expect(close).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(screen.getByRole('button', { name: 'Sačuvaj' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(opener).toHaveFocus()
  })
})

import { CustomerFields } from './CustomerFields'
import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { apiErrorMessage } from '../api/client'
import { customerApi } from '../api/customerApi'
import { Button, Modal, Alert } from '../components/ui'
import { NavigationIcon } from '../layout/NavigationIcon'
import type { CustomerListItem } from '../types/customer.types'
import { ActivationResult } from './ActivationResult'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import type { CustomerChoice } from './CustomerSearch'

export function CustomerFormDialog({ customer, onClose, onSaved, returnFocusRef, onContinue }: {
  customer?: CustomerListItem; onClose: () => void; onSaved: () => void
  returnFocusRef?: RefObject<HTMLButtonElement | null>; onContinue?: (customer: CustomerChoice) => void
}) {
  const [name, setName] = useState(customer?.name ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activation, setActivation] = useState<{ secret: string; expiresAt: string } | null>(null)
  const [createdCustomer, setCreatedCustomer] = useState<CustomerChoice | null>(null)
  const { confirm, confirmationDialog } = useConfirmDialog()
  useDirtyGuard(busy || !!activation || name !== (customer?.name ?? '') || email !== (customer?.email ?? ''), { pending: busy, retainedResult: !!activation })
  const inFlight = useRef(false)
  const firstInput = useRef<HTMLInputElement>(null)
  const id = useId(), formId = `${id}-form`
  const valid = Boolean(name.trim() && email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
  const close = () => {
    if (inFlight.current) return
    if (activation) { confirm({ title: 'Da li je kod predat klijentu?', description: 'Aktivacioni kod se prikazuje samo jednom.', confirmLabel: 'Kod je predat — zatvori', variant: 'warning', onConfirm: onClose }); return }
    if (name !== (customer?.name ?? '') || email !== (customer?.email ?? '')) {
      confirm({ title: 'Odbaci unose?', description: 'Nesačuvani podaci neće ostati u formi.', confirmLabel: 'Odbaci', variant: 'warning', onConfirm: onClose })
    } else onClose()
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!valid || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      if (customer) {
        await customerApi.update(customer.id, { name: name.trim(), email: email.trim(), version: customer.version })
        onSaved(); onClose()
      } else {
        // Keep the one-time secret only in this mounted dialog, outside query caches and URL state.
        const created = await customerApi.create({ name: name.trim(), email: email.trim() })
        setActivation({ secret: created.activationSecret, expiresAt: created.activationExpiresAt })
        setCreatedCustomer({ id: created.id, name: created.name, email: created.email })
        setName(''); setEmail(''); onSaved()
      }
    } catch (cause) { setError(apiErrorMessage(cause, customer ? 'Klijenta nije moguće izmeniti.' : 'Klijenta nije moguće kreirati.')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <>{confirmationDialog}<Modal size="wide" open className="customers-form-dialog" closeDisabled={busy}
    title={activation ? 'Klijent je uspešno kreiran' : customer ? 'Izmeni podatke klijenta' : 'Novi klijent'}
    titleIcon={<NavigationIcon to="/customers" />} initialFocusRef={firstInput} returnFocusRef={returnFocusRef} onClose={close}
    footer={<div className="ui-actions customers-dialog-actions">
      {activation ? <><Button type="button" variant="secondary" onClick={close}>Zatvori</Button>{onContinue && createdCustomer &&
        <Button onClick={() => { const choice = createdCustomer; setActivation(null); onContinue(choice) }}>Kod je predat — nastavi sesiju</Button>}</> : <>
        <Button type="button" variant="secondary" disabled={busy} onClick={close}>Otkaži</Button>
        <Button type="submit" form={formId} className="customers-pink-button" loading={busy} disabled={!valid}>
          {customer ? 'Sačuvaj podatke' : 'Kreiraj klijenta'}</Button>
      </>}
    </div>}>
    {activation ? <ActivationResult secret={activation.secret} expiresAt={activation.expiresAt} /> : <form id={formId} className="ui-form-grid customers-form" onSubmit={save}>
      <p>{customer ? 'Ažurirajte osnovne podatke klijenta.' : 'Kreirajte nalog i predajte jednokratni aktivacioni kod klijentu.'}</p>
      {error && <Alert tone="danger" role="alert">{error}</Alert>}
      <CustomerFields name={name} email={email} busy={busy} onName={setName} onEmail={setEmail} firstInput={firstInput}/>
      <small>* Obavezna polja</small>
    </form>}
  </Modal></>
}

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { apiErrorMessage } from '../api/client'
import { customerApi } from '../api/customerApi'
import { Button, FormField, Input, Modal, Textarea } from '../components/ui'
import { NavigationIcon } from '../layout/NavigationIcon'
import type { CustomerListItem } from '../types/customer.types'
import { customerDate } from './CustomerTable'

export function CustomerFormDialog({ customer, onClose, onSaved, returnFocusRef }: {
  customer?: CustomerListItem; onClose: () => void; onSaved: () => void
  returnFocusRef?: RefObject<HTMLButtonElement | null>
}) {
  const [name, setName] = useState(customer?.name ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activation, setActivation] = useState<{ secret: string; expiresAt: string } | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [copyBusy, setCopyBusy] = useState(false)
  const inFlight = useRef(false)
  const firstInput = useRef<HTMLInputElement>(null)
  const activationInput = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (activation) activationInput.current?.focus({ preventScroll: true }) }, [activation])
  const id = useId(), formId = `${id}-form`
  const valid = Boolean(name.trim() && email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
  const close = () => {
    if (inFlight.current) return
    setActivation(null)
    setCopyStatus('')
    onClose()
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
        setName(''); setEmail(''); onSaved()
      }
    } catch (cause) { setError(apiErrorMessage(cause, customer ? 'Klijenta nije moguće izmeniti.' : 'Klijenta nije moguće kreirati.')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  async function copyCode() {
    if (!activation || copyBusy) return
    setCopyBusy(true); setCopyStatus('')
    try {
      await navigator.clipboard.writeText(activation.secret)
      setCopyStatus('Kod je kopiran.')
    } catch { setCopyStatus('Kopiranje nije dostupno. Označite kod i kopirajte ga ručno.') }
    finally { setCopyBusy(false) }
  }
  return <Modal open className="customers-form-dialog" closeDisabled={busy}
    title={activation ? 'Klijent je uspešno kreiran' : customer ? 'Izmeni podatke klijenta' : 'Novi klijent'}
    titleIcon={<NavigationIcon to="/customers" />} initialFocusRef={firstInput} returnFocusRef={returnFocusRef} onClose={close}
    footer={<div className="customers-dialog-actions">
      {activation ? <Button type="button" className="customers-pink-button" onClick={close}>Zatvori</Button> : <>
        <Button type="button" variant="secondary" disabled={busy} onClick={close}>Otkaži</Button>
        <Button type="submit" form={formId} className="customers-pink-button" loading={busy} disabled={!valid}>
          {customer ? 'Sačuvaj podatke' : 'Kreiraj klijenta'}</Button>
      </>}
    </div>}>
    {activation ? <div className="customers-activation">
      <p>Sačuvajte aktivacioni kod i bezbedno ga predajte klijentu. Kod se prikazuje samo jednom.</p>
      <label htmlFor={`${id}-activation`}>Aktivacioni kod</label>
      <Textarea ref={activationInput} id={`${id}-activation`} className="customers-activation-code" rows={3} readOnly value={activation.secret}
        autoComplete="off" spellCheck={false} onFocus={event => event.currentTarget.select()} />
      <Button type="button" variant="secondary" loading={copyBusy} onClick={() => void copyCode()}>Kopiraj kod</Button>
      <p className="customers-copy-status" role="status">{copyStatus}</p>
      <div className="customers-activation-expiry"><span>Datum i vreme isteka</span><strong>{customerDate(activation.expiresAt)}</strong></div>
    </div> : <form id={formId} className="customers-form" onSubmit={save}>
      <p>{customer ? 'Ažurirajte osnovne podatke klijenta.' : 'Kreirajte nalog i predajte jednokratni aktivacioni kod klijentu.'}</p>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <FormField label="Ime i prezime *" htmlFor={`${id}-name`}>
        <Input ref={firstInput} id={`${id}-name`} required maxLength={120} autoComplete="name" disabled={busy}
          value={name} onChange={event => setName(event.target.value)} />
      </FormField>
      <FormField label="Email adresa *" htmlFor={`${id}-email`}>
        <Input id={`${id}-email`} required type="email" maxLength={180} autoComplete="email" disabled={busy}
          value={email} onChange={event => setEmail(event.target.value)} />
      </FormField>
      <small>* Obavezna polja</small>
    </form>}
  </Modal>
}

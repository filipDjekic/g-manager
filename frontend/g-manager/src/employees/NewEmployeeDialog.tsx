import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, FormField, Input, Modal } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { focusFirstInvalid, useDirtyGuard } from '../forms/useDirtyGuard'
import type { UserResponse } from '../types/user.types'
import { EmployeeIcon } from './employeePresentation'
import { employeeError } from './employeePresentation.model'

export function NewEmployeeDialog({ actorId, onClose, onCreated, returnFocusRef }: {
  actorId: string; onClose: () => void; onCreated: (employee: UserResponse) => void
  returnFocusRef: React.RefObject<HTMLElement | null>
}) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [nameError, setNameError] = useState('')
  const inFlight = useRef(false), mounted = useRef(false), initialFocus = useRef<HTMLInputElement>(null), id = useId()
  const dirty = Boolean(name || email || password)
  useDirtyGuard(dirty)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  function close() {
    if (inFlight.current) return
    if (!dirty) { onClose(); return }
    confirm({ title: 'Odbaci unete podatke?', titleIcon: <EmployeeIcon kind="add" />, className: 'gm-employee-dialog',
      description: 'Nalog nije kreiran. Uneti podaci biće uklonjeni kada zatvorite formular.', variant: 'warning',
      confirmLabel: 'Odbaci podatke', cancelLabel: 'Nastavi unos', onConfirm: onClose })
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const element = event.currentTarget, actor = useAuthStore.getState().user
    if (actor?.id !== actorId || !hasCapability(actor, 'USER_CREATE')) return
    if (!name.trim()) { setNameError('Unesite ime i prezime.'); initialFocus.current?.focus(); return }
    if (!element.reportValidity()) { focusFirstInvalid(element); return }
    inFlight.current = true; setBusy(true); setError('')
    try {
      const created = await userApi.create({ name: name.trim(), email: email.trim(), password, role: 'EMPLOYEE' })
      if (!mounted.current || useAuthStore.getState().user?.id !== actorId) return
      setName(''); setEmail(''); setPassword(''); setVisible(false)
      onCreated(created)
    } catch (cause) { if (mounted.current) setError(employeeError(cause, 'Nalog nije moguće kreirati. Proverite podatke i pokušajte ponovo.')) }
    finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  return <>{confirmationDialog}<Modal open title="Novi zaposleni" titleIcon={<EmployeeIcon kind="add" />}
    className="gm-employee-dialog gm-employee-create-dialog" closeDisabled={busy} initialFocusRef={initialFocus} returnFocusRef={returnFocusRef}
    descriptionId={`${id}-description`} onClose={close}
    footer={<div className="dialog-actions"><Button type="button" variant="secondary" disabled={busy} onClick={close}>Otkaži</Button>
      <Button type="submit" form={`${id}-form`} className="gm-employee-primary" loading={busy}>Dodaj zaposlenog</Button></div>}>
    <p id={`${id}-description`} className="gm-employee-note">Kreirajte nalog novog zaposlenog.</p>
    <form id={`${id}-form`} className="gm-employee-create-form" onSubmit={event => void submit(event)}>
      <FormField htmlFor={`${id}-name`} label="Ime i prezime" error={nameError}>
        <Input ref={initialFocus} id={`${id}-name`} required minLength={2} maxLength={120} autoComplete="off" disabled={busy}
          value={name} onChange={event => { setName(event.target.value); setNameError(''); setError('') }} />
      </FormField>
      <FormField htmlFor={`${id}-email`} label="Email adresa">
        <Input id={`${id}-email`} type="email" required maxLength={180} autoComplete="off" disabled={busy}
          value={email} onChange={event => { setEmail(event.target.value); setError('') }} />
      </FormField>
      <div className="gm-employee-password-field"><FormField htmlFor={`${id}-password`} label="Početna lozinka" hint="Od 8 do 100 karaktera.">
        <Input id={`${id}-password`} type={visible ? 'text' : 'password'} required minLength={8} maxLength={100}
          autoComplete="new-password" disabled={busy} value={password} onChange={event => { setPassword(event.target.value); setError('') }} />
      </FormField><Button type="button" variant="secondary" disabled={busy} aria-controls={`${id}-password`} aria-pressed={visible}
        aria-label={visible ? 'Sakrij lozinku' : 'Prikaži lozinku'} onClick={() => setVisible(value => !value)}><EmployeeIcon kind={visible ? 'eye-off' : 'eye'} /></Button></div>
      <div className="gm-employee-fixed-role"><span>Uloga</span><Badge tone="info">Zaposleni</Badge><small>Nalog se kreira sa ulogom zaposlenog.</small></div>
      {error && <p className="error-banner" role="alert">{error}</p>}
    </form>
  </Modal></>
}

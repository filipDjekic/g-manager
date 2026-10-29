import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, FormField, Input, Modal, Alert } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import type { AuthUser } from '../types/auth.types'
import type { CreateUserRequest, UserResponse } from '../types/user.types'
import { UserIcon, UserRoleBadge } from './userPresentation'
import { userError } from './userPresentation.model'

export function NewUserDialog({ actor, onClose, onCreated, returnFocusRef }: {
  actor: AuthUser; onClose: () => void; onCreated: (user: UserResponse) => void; returnFocusRef: React.RefObject<HTMLElement | null>
}) {
  const id = useId(), { confirm, confirmationDialog } = useConfirmDialog()
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [role, setRole] = useState<CreateUserRequest['role']>('EMPLOYEE'), [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [nameError, setNameError] = useState('')
  const inFlight = useRef(false), mounted = useRef(false), firstField = useRef<HTMLInputElement>(null)
  const dirty = Boolean(name || email || password || role !== 'EMPLOYEE')
  useDirtyGuard(dirty)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  function close() {
    if (inFlight.current) return
    if (!dirty) { onClose(); return }
    confirm({ title: 'Odbaci unete podatke?', titleIcon: <UserIcon kind="add" />, className: 'gm-user-dialog', variant: 'warning',
      description: 'Nalog nije kreiran. Uneti podaci biće uklonjeni kada zatvorite formular.', confirmLabel: 'Odbaci podatke', cancelLabel: 'Nastavi unos', onConfirm: onClose })
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const current = useAuthStore.getState().user
    if (current?.id !== actor.id || !['OWNER', 'ADMIN'].includes(current.role) || !hasCapability(current, 'USER_CREATE')) return
    if (!name.trim()) { setNameError('Unesite ime i prezime.'); firstField.current?.focus(); return }
    if (!event.currentTarget.reportValidity()) return
    if (!password.trim()) { setError('Početna lozinka ne može sadržati samo razmake.'); return }
    const requestedRole: CreateUserRequest['role'] = current.role === 'OWNER' && role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE'
    inFlight.current = true; setBusy(true); setError('')
    try {
      const created = await userApi.create({ name: name.trim(), email: email.trim(), password, role: requestedRole })
      if (!mounted.current || useAuthStore.getState().user?.id !== actor.id) return
      setName(''); setEmail(''); setPassword(''); setRole('EMPLOYEE'); setVisible(false)
      onCreated(created)
    } catch (cause) { if (mounted.current) setError(userError(cause, 'Nalog nije moguće kreirati. Proverite podatke i pokušajte ponovo.')) }
    finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  return <>{confirmationDialog}<Modal open title="Novi korisnik" titleIcon={<UserIcon kind="add" />} className="gm-user-dialog gm-user-create-dialog"
    initialFocusRef={firstField} returnFocusRef={returnFocusRef} closeDisabled={busy} descriptionId={`${id}-description`} onClose={close}
    footer={<div className="ui-actions dialog-actions"><Button type="button" variant="secondary" disabled={busy} onClick={close}>Otkaži</Button>
      <Button type="submit" form={`${id}-form`} className="gm-user-primary" loading={busy}>Kreiraj korisnika</Button></div>}>
    <p id={`${id}-description`} className="gm-user-note">Kreirajte administratorski nalog ili nalog zaposlenog.</p>
    <form id={`${id}-form`} className="ui-form-grid gm-user-create-form" onSubmit={event => void submit(event)}>
      <FormField htmlFor={`${id}-name`} label="Ime i prezime" error={nameError}><Input ref={firstField} id={`${id}-name`} required minLength={2} maxLength={120}
        autoComplete="off" disabled={busy} value={name} onChange={event => { setName(event.target.value); setNameError(''); setError('') }} /></FormField>
      <FormField htmlFor={`${id}-email`} label="Email adresa"><Input id={`${id}-email`} type="email" required maxLength={180} autoComplete="off"
        disabled={busy} value={email} onChange={event => { setEmail(event.target.value); setError('') }} /></FormField>
      <div className="gm-user-password-field"><FormField htmlFor={`${id}-password`} label="Početna lozinka" hint="Od 8 do 100 karaktera."><Input id={`${id}-password`}
        type={visible ? 'text' : 'password'} required minLength={8} maxLength={100} autoComplete="new-password" disabled={busy} value={password} onChange={event => { setPassword(event.target.value); setError('') }} /></FormField>
        <Button iconOnly type="button" variant="secondary" disabled={busy} aria-controls={`${id}-password`} aria-pressed={visible} aria-label={visible ? 'Sakrij lozinku' : 'Prikaži lozinku'}
          onClick={() => setVisible(value => !value)}><UserIcon kind={visible ? 'eye-off' : 'eye'} /></Button></div>
      {actor.role === 'OWNER' ? <fieldset className="gm-user-role-field"><legend>Uloga</legend><div>
        {(['ADMIN', 'EMPLOYEE'] as const).map(value => <label className={`gm-user-role-choice${role === value ? ' is-selected' : ''}`} key={value}>
          <Input type="radio" name={`${id}-role`} value={value} checked={role === value} disabled={busy} onChange={() => setRole(value)} /><UserRoleBadge role={value} /></label>)}
      </div></fieldset> : <div className="gm-user-fixed-role"><span>Uloga</span><UserRoleBadge role="EMPLOYEE" /><small>Administratori mogu kreirati samo naloge zaposlenih.</small></div>}
      <p className="gm-user-note"><Badge tone="neutral">Klijenti</Badge> Nalozi klijenata kreiraju se kroz postojeći tok u odeljku Klijenti.</p>
      {error && <Alert tone="danger" role="alert">{error}</Alert>}
    </form>
  </Modal></>
}

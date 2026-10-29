import { useId, useState, type RefObject } from 'react'
import { Button, FormField, Input } from '../components/ui'

export function StaffAccountFields({ name, email, password, onName, onEmail, onPassword, busy, nameError, firstField }: {
  name: string; email: string; password: string; onName: (value: string) => void; onEmail: (value: string) => void; onPassword: (value: string) => void
  busy: boolean; nameError?: string; firstField: RefObject<HTMLInputElement | null>
}) {
  const id = useId(), [visible, setVisible] = useState(false)
  return <>
    <FormField htmlFor={id + '-name'} label="Ime i prezime" error={nameError}><Input ref={firstField} id={id + '-name'} required minLength={2} maxLength={120}
      autoComplete="off" disabled={busy} value={name} onChange={event => onName(event.target.value)} /></FormField>
    <FormField htmlFor={id + '-email'} label="Email adresa"><Input id={id + '-email'} type="email" required maxLength={180} autoComplete="off"
      disabled={busy} value={email} onChange={event => onEmail(event.target.value)} /></FormField>
    <div className="ui-password-field"><FormField htmlFor={id + '-password'} label="Početna lozinka" hint="Od 8 do 100 karaktera; predajte je zaposlenom.">
      <Input id={id + '-password'} type={visible ? 'text' : 'password'} required minLength={8} maxLength={100} autoComplete="new-password" disabled={busy}
        value={password} onChange={event => onPassword(event.target.value)} /></FormField>
      <Button type="button" variant="secondary" disabled={busy} aria-controls={id + '-password'} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? 'Sakrij' : 'Prikaži'}</Button>
    </div>
  </>
}

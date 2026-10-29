import { useId, type RefObject } from 'react'
import { FormField, Input } from '../components/ui'

export function CustomerFields({ name, email, busy, onName, onEmail, firstInput }: {
  name: string; email: string; busy: boolean; onName: (value: string) => void; onEmail: (value: string) => void; firstInput: RefObject<HTMLInputElement | null>
}) {
  const id = useId()
  return <><FormField label="Ime i prezime" htmlFor={id + '-name'}><Input ref={firstInput} id={id + '-name'} required maxLength={120}
    autoComplete="name" disabled={busy} value={name} onChange={event => onName(event.target.value)} /></FormField>
    <FormField label="Email adresa" htmlFor={id + '-email'}><Input id={id + '-email'} required type="email" maxLength={180}
      autoComplete="email" disabled={busy} value={email} onChange={event => onEmail(event.target.value)} /></FormField></>
}

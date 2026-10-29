import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { userApi } from '../api/userApi'
import { Button, Input, Card } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import { focusFirstInvalid } from '../forms/useDirtyGuard'
import { ProfileIcon } from './profilePresentation'
import { passwordErrors, passwordStrength, profileError } from './profilePresentation.model'

function PasswordField({ id, label, visibilityLabel, value, onChange, onBlur, show, toggle, disabled, error, hint, fresh = false, strengthId }: {
  id: string; label: string; visibilityLabel: string; value: string; onChange: (value: string) => void; onBlur: () => void
  show: boolean; toggle: () => void; disabled: boolean; error: string; hint?: string; fresh?: boolean; strengthId?: string
}) {
  return <div className="gm-profile-field"><label htmlFor={id}>{label}</label>
    <div className="gm-profile-input-wrap gm-profile-password-input"><ProfileIcon kind="lock" />
      <Input id={id} name={id} required type={show ? 'text' : 'password'} autoComplete={fresh ? 'new-password' : 'current-password'}
        value={value} disabled={disabled} maxLength={fresh ? 100 : undefined} minLength={fresh ? 8 : undefined}
        autoCapitalize="none" spellCheck={false} aria-invalid={!!error || undefined} aria-describedby={[`${id}-feedback`, strengthId].filter(Boolean).join(' ')}
        onBlur={onBlur} onChange={event => onChange(event.target.value)} />
      <Button iconOnly type="button" variant="secondary" className="gm-profile-eye" disabled={disabled} aria-pressed={show}
        aria-label={`${show ? 'Sakrij' : 'Prikaži'} ${visibilityLabel}`} aria-controls={id} onClick={toggle}><ProfileIcon kind={show ? 'eyeOff' : 'eye'} /></Button>
    </div><p id={`${id}-feedback`} className={error ? 'gm-profile-error' : 'gm-profile-field-hint'}>{error || hint}</p>
  </div>
}

export function ProfilePasswordCard({ canUpdate, onChanged, onDirty }: {
  canUpdate: boolean; onChanged: () => void; onDirty: (dirty: boolean) => void
}) {
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState({ current: false, next: false, confirmation: false })
  const [touched, setTouched] = useState({ current: false, next: false, confirmation: false })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const inFlight = useRef(false), mounted = useRef(true), id = useId(), toast = useToast()
  const errors = passwordErrors(current, next, confirmation), strength = passwordStrength(next)
  const dirty = !!(current || next || confirmation), valid = !Object.values(errors).some(Boolean)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  function clear() {
    setCurrent(''); setNext(''); setConfirmation(''); setTouched({ current: false, next: false, confirmation: false })
    setVisible({ current: false, next: false, confirmation: false })
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTouched({ current: true, next: true, confirmation: true })
    if (!canUpdate || inFlight.current) return
    const form = event.currentTarget
    if (!valid) { window.requestAnimationFrame(() => focusFirstInvalid(form)); return }
    inFlight.current = true; setBusy(true); setError('')
    try {
      await userApi.changePassword(current, next)
      if (!mounted.current) return
      clear(); onChanged(); toast('Lozinka je uspešno promenjena. Ostale sesije su odjavljene.', 'success')
    } catch (cause) {
      if (!mounted.current) return
      clear()
      setError(isAxiosError(cause) && !cause.response ? 'Nije moguće potvrditi ishod promene lozinke. Proverite pristup nalogu pre ponovnog pokušaja.'
        : profileError(cause, 'Lozinku nije moguće promeniti.'))
      window.requestAnimationFrame(() => { if (form.isConnected) form.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')?.focus({ preventScroll: true }) })
    } finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  const toggle = (key: keyof typeof visible) => setVisible(value => ({ ...value, [key]: !value[key] }))
  const touch = (key: keyof typeof touched) => setTouched(value => ({ ...value, [key]: true }))
  return <Card className="gm-profile-card gm-profile-password" aria-labelledby={`${id}-title`}>
    <header className="gm-profile-card-header"><span className="gm-profile-card-icon"><ProfileIcon kind="lock" /></span>
      <div><h2 id={`${id}-title`}>Promena lozinke</h2><p>Izaberite novu, sigurnu lozinku za vaš nalog.</p></div></header>
    <form className="ui-form-grid gm-profile-form" onSubmit={save} noValidate>
      <PasswordField id={`${id}-current`} label="Trenutna lozinka" visibilityLabel="trenutnu lozinku" value={current}
        onChange={value => { setCurrent(value); setError('') }} onBlur={() => touch('current')} show={visible.current} toggle={() => toggle('current')}
        disabled={!canUpdate || busy} error={touched.current ? errors.current : ''} />
      <PasswordField id={`${id}-new`} label="Nova lozinka" visibilityLabel="novu lozinku" value={next} fresh
        onChange={value => { setNext(value); setError('') }} onBlur={() => touch('next')} show={visible.next} toggle={() => toggle('next')}
        disabled={!canUpdate || busy} error={touched.next ? errors.next : ''} hint="Od 8 do 100 karaktera." strengthId={`${id}-strength-note`} />
      <div className={`gm-profile-strength gm-profile-strength--${strength.tone}`}>
        <div className="gm-profile-strength-label"><span>Informativna jačina lozinke</span><strong>{strength.level ? strength.label : '—'}</strong></div>
        <div className="gm-profile-strength-segments" role="meter" aria-label="Informativna procena jačine lozinke" aria-valuemin={0} aria-valuemax={4}
          aria-valuenow={strength.level} aria-valuetext={strength.label}>{[1, 2, 3, 4].map(level => <span key={level} className={level <= strength.level ? 'is-filled' : ''} />)}</div>
        <p id={`${id}-strength-note`}>Procena je informativna i nije garancija bezbednosti.</p>
      </div>
      <PasswordField id={`${id}-confirm`} label="Potvrda nove lozinke" visibilityLabel="potvrdu nove lozinke" value={confirmation} fresh
        onChange={value => { setConfirmation(value); setError('') }} onBlur={() => touch('confirmation')} show={visible.confirmation} toggle={() => toggle('confirmation')}
        disabled={!canUpdate || busy} error={touched.confirmation ? errors.confirmation : ''} />
      <div className="gm-profile-password-guidance"><h3>Za sigurniju lozinku</h3><ul>
        <li className={next.length >= 8 ? 'is-met' : ''}><ProfileIcon kind="check" /><span>Najmanje 8 karaktera.</span></li>
        <li className={next.length >= 12 ? 'is-met' : ''}><ProfileIcon kind="check" /><span>Preporučena je duža lozinka, od najmanje 12 karaktera.</span></li>
        <li><ProfileIcon kind="shield" /><span>Izbegavajte lako pogodive kombinacije.</span></li>
        <li className={current && next && current !== next ? 'is-met' : ''}><ProfileIcon kind="lock" /><span>Ne koristite trenutnu lozinku ponovo.</span></li>
      </ul></div>
      {dirty && <p className="gm-profile-field-hint" role="status">Promena lozinke još nije sačuvana.</p>}
      {error && <div className="gm-profile-error" role="alert"><p>{error}</p><p className="gm-profile-field-hint">Polja lozinki su očišćena. Unesite ih ponovo kada budete spremni.</p></div>}
      <Button className="gm-profile-password-button" type="submit" loading={busy} disabled={!canUpdate || !valid}><ProfileIcon kind="lock" />Promeni lozinku</Button>
    </form>
  </Card>
}

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { userApi } from '../api/userApi'
import { Badge, Button, Input } from '../components/ui'
import { roleLabels } from '../components/ui/statusPresentation'
import { useToast } from '../components/ui/toastContext'
import { focusFirstInvalid } from '../forms/useDirtyGuard'
import type { UserResponse } from '../types/user.types'
import { ProfileAvatarEditor } from './ProfileAvatarEditor'
import { ProfileIcon } from './profilePresentation'
import { nameError, profileError } from './profilePresentation.model'

export function ProfilePersonalCard({ profile, canUpdate, onSaved, onDirty }: {
  profile: UserResponse; canUpdate: boolean; onSaved: (user: UserResponse) => void; onDirty: (dirty: boolean) => void
}) {
  const [name, setName] = useState(profile.name), [avatarDirty, setAvatarDirty] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [touched, setTouched] = useState(false)
  const previousName = useRef(profile.name), inFlight = useRef(false), mounted = useRef(true), id = useId(), toast = useToast()
  const dirty = name.trim() !== profile.name.trim(), invalid = nameError(name)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const previous = previousName.current
    setName(value => value.trim() === previous.trim() ? profile.name : value)
    previousName.current = profile.name
  }, [profile.name])
  useEffect(() => { onDirty(dirty || avatarDirty) }, [dirty, avatarDirty, onDirty])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTouched(true)
    if (!canUpdate || !dirty || inFlight.current) return
    if (invalid) { const form = event.currentTarget; window.requestAnimationFrame(() => focusFirstInvalid(form)); return }
    inFlight.current = true; setBusy(true); setError('')
    try {
      const user = await userApi.updateMe(name.trim())
      if (!mounted.current) return
      onSaved(user); setName(user.name); setTouched(false); toast('Lični podaci su uspešno sačuvani.', 'success')
    } catch (cause) { if (mounted.current) setError(profileError(cause, 'Lične podatke nije moguće sačuvati.')) }
    finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  return <section className="gm-profile-card gm-profile-personal" aria-labelledby={`${id}-title`}>
    <header className="gm-profile-card-header"><span className="gm-profile-card-icon"><ProfileIcon kind="user" /></span>
      <div><h2 id={`${id}-title`}>Lični podaci</h2><p>Uredite svoje osnovne informacije i avatar.</p></div></header>
    <ProfileAvatarEditor profile={profile} canUpdate={canUpdate} onSaved={onSaved} onDirty={setAvatarDirty} />
    <form className="gm-profile-form" onSubmit={save} noValidate>
      <div className="gm-profile-field"><label htmlFor={`${id}-name`}>Ime i prezime</label><div className="gm-profile-input-wrap"><ProfileIcon kind="user" />
        <Input id={`${id}-name`} name="name" autoComplete="name" required minLength={2} maxLength={120} value={name}
          disabled={!canUpdate || busy} aria-invalid={touched && !!invalid || undefined} aria-describedby={`${id}-name-feedback`}
          onBlur={() => setTouched(true)} onChange={event => { setName(event.target.value); setTouched(true); setError('') }} /></div>
        <p id={`${id}-name-feedback`} className={touched && invalid ? 'gm-profile-error' : 'gm-profile-field-hint'}>{touched && invalid ? invalid : 'Od 2 do 120 karaktera.'}</p>
      </div>
      <div className="gm-profile-field"><label htmlFor={`${id}-email`}>Email adresa</label><div className="gm-profile-input-wrap"><ProfileIcon kind="mail" />
        <Input id={`${id}-email`} type="email" value={profile.email} readOnly autoComplete="email" aria-describedby={`${id}-email-hint`} /></div>
        <p id={`${id}-email-hint`} className="gm-profile-field-hint">Email adresa se ne menja kroz ovu stranicu.</p>
      </div>
      <div className="gm-profile-facts"><div><ProfileIcon kind="shield" /><div><span>Uloga</span><strong>{roleLabels[profile.role]}</strong></div></div>
        <div><ProfileIcon kind={profile.active ? 'check' : 'inactive'} /><div><span>Status naloga</span><Badge tone={profile.active ? 'success' : 'danger'}>{profile.active ? 'Aktivan' : 'Neaktivan'}</Badge></div></div>
      </div>
      {!canUpdate && <p className="gm-profile-field-hint">Nemate dozvolu za izmenu ličnih podataka, avatara ili lozinke.</p>}
      {dirty && <div className="gm-profile-dirty-note" role="status"><span>Imate nesačuvane izmene imena.</span>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => { setName(profile.name); setTouched(false); setError('') }}>Odustani od izmene</Button></div>}
      {error && <p className="gm-profile-error" role="alert">{error}</p>}
      <Button className="gm-profile-save-button" type="submit" loading={busy} disabled={!canUpdate || !dirty || !!invalid}><ProfileIcon kind="save" />Sačuvaj izmene</Button>
    </form>
  </section>
}

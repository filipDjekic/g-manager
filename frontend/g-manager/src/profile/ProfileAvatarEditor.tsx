import { useObjectUrl } from '../components/useObjectUrl'
import { useResettableState } from '../components/useResettableState'
import { useEffect, useId, useRef, useState } from 'react'
import { userApi } from '../api/userApi'
import { AccountAvatar } from '../components/AccountAvatar'
import { type AvatarStatus } from '../components/AccountAvatar.model'
import { Button, Modal, Input } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import type { UserResponse } from '../types/user.types'
import { ProfileIcon } from './profilePresentation'
import { profileError } from './profilePresentation.model'

export function ProfileAvatarEditor({ profile, canUpdate, onSaved, onDirty }: {
  profile: UserResponse; canUpdate: boolean; onSaved: (user: UserResponse) => void; onDirty: (dirty: boolean) => void
}) {
  const picker = useRef<HTMLInputElement>(null), opener = useRef<HTMLElement | null>(null), inFlight = useRef(false)
  const mounted = useRef(true), toast = useToast(), id = useId()
  const [file, setFile] = useState<File | null>(null)
  const preview = useObjectUrl(file)
  const [previewReady, setPreviewReady] = useResettableState(() => false, preview), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [avatarStatus, setAvatarStatus] = useState<AvatarStatus>('empty'), [reload, setReload] = useState(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { onDirty(file !== null) }, [file, onDirty])
  function pick(trigger: HTMLButtonElement) {
    if (!canUpdate || inFlight.current) return
    opener.current = trigger; picker.current?.click()
  }
  function choose(next?: File) {
    if (!next || !canUpdate || inFlight.current) return
    if (!['image/png', 'image/jpeg'].includes(next.type)) { setError('Izaberite PNG ili JPEG sliku.'); return }
    if (!next.size) { setError('Izabrana slika je prazna.'); return }
    setError(''); setPreviewReady(false); setFile(next)
  }
  function close() { if (!inFlight.current) { setFile(null); setError('') } }
  async function upload() {
    if (!canUpdate || !file || !previewReady || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const user = await userApi.uploadAvatar(file)
      if (!mounted.current) return
      onSaved(user); setFile(null); toast('Avatar je uspešno otpremljen.', 'success')
    } catch (cause) { if (mounted.current) setError(profileError(cause, 'Otpremanje avatara nije potvrđeno. Pokušajte ponovo kada proverite prikaz svog naloga.')) }
    finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  return <div className="gm-profile-avatar-editor">
    <div className="gm-profile-avatar-wrap"><span className="gm-profile-avatar" role="img" aria-label={`Avatar korisnika ${profile.name}`}>
      <AccountAvatar user={profile} reload={reload} onStatus={setAvatarStatus} /></span>
      <Button iconOnly type="button" variant="secondary" className="gm-profile-camera-button" disabled={!canUpdate || busy}
        aria-label="Izaberi novu sliku avatara" onClick={event => pick(event.currentTarget)}><ProfileIcon kind="camera" /></Button>
    </div>
    <div className="gm-profile-avatar-controls"><Button type="button" variant="secondary" disabled={!canUpdate || busy}
      onClick={event => pick(event.currentTarget)}><ProfileIcon kind="camera" />Promeni avatar</Button>
      <p>PNG ili JPEG. Maksimalnu veličinu fajla proverava server.</p>
      {avatarStatus === 'loading' && <p role="status">Avatar se priprema za prikaz…</p>}
      {avatarStatus === 'error' && <div className="gm-profile-avatar-unavailable"><p>Nova slika još nije dostupna za prikaz. Prethodna učitana slika ostaje prikazana.</p>
        <Button type="button" variant="secondary" onClick={() => setReload(value => value + 1)}>Učitaj avatar ponovo</Button></div>}
      {error && !file && <p className="gm-profile-error" role="alert">{error}</p>}
    </div>
    <Input ref={picker} type="file" hidden accept="image/png,image/jpeg,.png,.jpg,.jpeg" aria-label="Izaberite sliku avatara"
      disabled={!canUpdate || busy} onChange={event => { choose(event.target.files?.[0]); event.target.value = '' }} />
    <Modal open={file !== null} title="Promeni avatar" titleIcon={<ProfileIcon kind="camera" />} className="gm-profile-avatar-dialog"
      descriptionId={`${id}-description`} returnFocusRef={opener} onClose={close} closeDisabled={busy}
      footer={<div className="ui-actions gm-profile-dialog-actions"><Button type="button" variant="secondary" disabled={busy} onClick={close}>Odustani</Button>
        <Button type="button" loading={busy} disabled={!canUpdate || !previewReady} onClick={() => void upload()}><ProfileIcon kind="upload" />Otpremi avatar</Button></div>}>
      <p id={`${id}-description`}>Pregledajte izabranu sliku pre otpremanja. Server proverava format, veličinu i bezbednost fajla.</p>
      <div className="gm-profile-avatar-preview">{preview && <img key={preview} src={preview} alt="Pregled izabranog avatara"
        onLoad={() => setPreviewReady(true)} onError={() => { setPreviewReady(false); setError('Izabranu sliku nije moguće prikazati. Izaberite ispravnu PNG ili JPEG sliku.') }} />}</div>
      {file && <p className="gm-profile-selected-file"><strong>{file.name}</strong><span>{new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 2 }).format(file.size / 1024 / 1024)} MB</span></p>}
      {error && <p className="gm-profile-error" role="alert">{error}</p>}
    </Modal>
  </div>
}

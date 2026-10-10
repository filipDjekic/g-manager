import { type FormEvent, useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import type { UserResponse } from '../types/user.types'
import { Button, ErrorState, Skeleton } from '../components/ui'
import { hasCapability } from '../auth/capabilities'

export function ProfilePage() {
  const actor = useAuthStore((state) => state.user)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'profile' | 'password' | 'avatar' | null>(null)
  const inFlight = useRef(false)
  const updateUser = useAuthStore((state) => state.updateUser)
  const [profile, setProfile] = useState<UserResponse | null>(null)
  const [name, setName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    void userApi.me()
      .then((user) => {
        if (!active) return
        setProfile(user)
        setName(user.name)
      })
      .catch((cause) => { if (active) setError(apiErrorMessage(cause, 'Profil nije moguće učitati.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadAttempt])

  function synchronize(user: UserResponse) {
    setProfile(user)
    updateUser(user)
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true; setBusy('profile')
    setError('')
    try {
      synchronize(await userApi.updateMe(name))
      setMessage('Profil je sačuvan.')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Profil nije moguće sačuvati.'))
    } finally { inFlight.current = false; setBusy(null) }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true; setBusy('password')
    setError('')
    try {
      await userApi.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setMessage('Lozinka je promenjena. Ostale sesije su odjavljene.')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Lozinku nije moguće promeniti.'))
    } finally { inFlight.current = false; setBusy(null) }
  }

  async function upload(file?: File) {
    if (!file || inFlight.current) return
    inFlight.current = true; setBusy('avatar')
    setError('')
    try {
      synchronize(await userApi.uploadAvatar(file))
      setMessage('Avatar je sačuvan.')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Avatar nije moguće sačuvati.'))
    } finally { inFlight.current = false; setBusy(null) }
  }

  return (
    <main className="workspace">
      <div className="page-heading">
        <div><p className="eyebrow">Nalog</p><h1>Moj profil</h1></div>
        {profile?.avatarUrl
          ? <img className="avatar" src={profile.avatarUrl} alt="" decoding="async" width="80" height="80" />
          : <span className="avatar avatar-fallback">{profile?.name?.slice(0, 1)}</span>}
      </div>
      {error && profile && <p className="error-banner" role="alert">{error}</p>}
      {!loading && !profile && <ErrorState message={error || 'Profil nije dostupan.'}
        action={<Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Pokušaj ponovo</Button>} />}
      {message && <p className="success-banner" role="status">{message}</p>}
      {loading && <Skeleton lines={4} label="Učitavanje profila" />}
      {!loading && profile &&
      <div className="panel-grid">
        <form className="panel" onSubmit={saveProfile}>
          <h2>Osnovni podaci</h2>
          <label>Ime<input value={name} minLength={2} maxLength={120} required onChange={(e) => setName(e.target.value)} /></label>
          <label>Email<input value={profile?.email ?? ''} disabled /></label>
          <Button type="submit" loading={busy === 'profile'} disabled={Boolean(busy) || !hasCapability(actor,'PROFILE_UPDATE')}>Sačuvaj profil</Button>
        </form>
        <form className="panel" onSubmit={savePassword}>
          <h2>Promena lozinke</h2>
          <label>Trenutna lozinka<input type="password" autoComplete="current-password" value={currentPassword} required onChange={(e) => setCurrentPassword(e.target.value)} /></label>
          <label>Nova lozinka<input type="password" autoComplete="new-password" value={newPassword} minLength={8} maxLength={100} required onChange={(e) => setNewPassword(e.target.value)} /></label>
          <Button type="submit" loading={busy === 'password'} disabled={Boolean(busy) || !hasCapability(actor,'PROFILE_UPDATE')}>Promeni lozinku</Button>
        </form>
        <section className="panel">
          <h2>Avatar</h2>
          <p>PNG ili JPEG, najviše 5 MB.</p>
          <label className="file-control">Izaberi sliku<input type="file" disabled={Boolean(busy) || !hasCapability(actor,'PROFILE_UPDATE')} accept="image/png,image/jpeg" onChange={(e) => void upload(e.target.files?.[0])} /></label>
        </section>
      </div>}
    </main>
  )
}

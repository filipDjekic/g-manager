import { type FormEvent, useEffect, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import type { UserResponse } from '../types/user.types'

export function ProfilePage() {
  const updateUser = useAuthStore((state) => state.updateUser)
  const [profile, setProfile] = useState<UserResponse | null>(null)
  const [name, setName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void userApi.me()
      .then((user) => {
        setProfile(user)
        setName(user.name)
      })
      .catch((cause) => setError(apiErrorMessage(cause, 'Profil nije moguće učitati.')))
  }, [])

  function synchronize(user: UserResponse) {
    setProfile(user)
    updateUser(user)
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      synchronize(await userApi.updateMe(name))
      setMessage('Profil je sačuvan.')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Profil nije moguće sačuvati.'))
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await userApi.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setMessage('Lozinka je promenjena. Ostale sesije su odjavljene.')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Lozinku nije moguće promeniti.'))
    }
  }

  async function upload(file?: File) {
    if (!file) return
    setError('')
    try {
      synchronize(await userApi.uploadAvatar(file))
      setMessage('Avatar je sačuvan.')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Avatar nije moguće sačuvati.'))
    }
  }

  return (
    <main className="workspace">
      <div className="page-heading">
        <div><p className="eyebrow">Nalog</p><h1>Moj profil</h1></div>
        {profile?.avatarUrl
          ? <img className="avatar" src={profile.avatarUrl} alt="" decoding="async" width="80" height="80" />
          : <span className="avatar avatar-fallback">{profile?.name?.slice(0, 1)}</span>}
      </div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {message && <p className="success-banner" role="status">{message}</p>}
      <div className="panel-grid">
        <form className="panel" onSubmit={saveProfile}>
          <h2>Osnovni podaci</h2>
          <label>Ime<input value={name} minLength={2} maxLength={120} required onChange={(e) => setName(e.target.value)} /></label>
          <label>Email<input value={profile?.email ?? ''} disabled /></label>
          <button type="submit">Sačuvaj profil</button>
        </form>
        <form className="panel" onSubmit={savePassword}>
          <h2>Promena lozinke</h2>
          <label>Trenutna lozinka<input type="password" value={currentPassword} required onChange={(e) => setCurrentPassword(e.target.value)} /></label>
          <label>Nova lozinka<input type="password" value={newPassword} minLength={8} maxLength={100} required onChange={(e) => setNewPassword(e.target.value)} /></label>
          <button type="submit">Promeni lozinku</button>
        </form>
        <section className="panel">
          <h2>Avatar</h2>
          <p>PNG ili JPEG, najviše 5 MB.</p>
          <label className="file-control">Izaberi sliku<input type="file" accept="image/png,image/jpeg" onChange={(e) => void upload(e.target.files?.[0])} /></label>
        </section>
      </div>
    </main>
  )
}

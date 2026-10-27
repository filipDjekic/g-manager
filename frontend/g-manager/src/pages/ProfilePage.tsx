import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Button, ErrorState, Skeleton } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import type { AuthUser } from '../types/auth.types'
import type { UserResponse } from '../types/user.types'
import { ProfilePersonalCard } from '../profile/ProfilePersonalCard'
import { ProfilePasswordCard } from '../profile/ProfilePasswordCard'
import { ProfileAccountCard } from '../profile/ProfileAccountCard'
import { ProfileIcon } from '../profile/profilePresentation'
import { profileError } from '../profile/profilePresentation.model'
import '../profile/profile.css'

function ProfileHeading() {
  return <header className="gm-profile-header"><span className="gm-profile-header-icon"><ProfileIcon kind="user" /></span>
    <div><h1>Moj profil</h1><p>Lični podaci, avatar i bezbednost naloga.</p></div></header>
}

export function ProfilePage() {
  const actor = useAuthStore(state => state.user)
  if (!actor || !hasCapability(actor, 'PROFILE_READ')) return <main className="workspace workspace--reading gm-profile"><ProfileHeading />
    <ErrorState title="Pristup nije dozvoljen" message="Nemate dozvolu za pregled profila." /></main>
  return <ProfileWorkspace key={actor.id} actor={actor} />
}

function ProfileWorkspace({ actor }: { actor: AuthUser }) {
  const [profile, setProfile] = useState<UserResponse | null>(null), [fetching, setFetching] = useState(true)
  const [error, setError] = useState(''), [loadAttempt, setLoadAttempt] = useState(0)
  const [personalDirty, setPersonalDirty] = useState(false), [passwordDirty, setPasswordDirty] = useState(false)
  const profileRef = useRef<UserResponse | null>(null), mounted = useRef(true), navigate = useNavigate()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const canUpdate = hasCapability(actor, 'PROFILE_UPDATE')
  useDirtyGuard(personalDirty || passwordDirty)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const synchronize = useCallback((user: UserResponse) => {
    if (!mounted.current || useAuthStore.getState().user?.id !== actor.id || user.id !== actor.id) return
    if (profileRef.current && user.version < profileRef.current.version) return
    profileRef.current = user; setProfile(user); useAuthStore.getState().updateUser(user)
  }, [actor.id])
  useEffect(() => {
    let active = true
    // Explicit profile reload starts a new external request; stale draft data remains until its response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetching(true); setError('')
    void userApi.me().then(user => { if (active) synchronize(user) })
      .catch(cause => { if (active) setError(profileError(cause, 'Profil nije moguće učitati.')) })
      .finally(() => { if (active) setFetching(false) })
    return () => { active = false }
  }, [synchronize, loadAttempt])
  const reload = useCallback(() => setLoadAttempt(value => value + 1), [])
  function openSessions(event: MouseEvent<HTMLAnchorElement>) {
    if (!personalDirty && !passwordDirty || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    confirm({ title: 'Napusti profil?', description: 'Imate nesačuvane unose. Ako nastavite, ti unosi neće ostati u ovoj formi.',
      confirmLabel: 'Upravljaj sesijama', cancelLabel: 'Ostani na profilu', variant: 'warning',
      className: 'gm-profile-leave-dialog', titleIcon: <ProfileIcon kind="shield" />, onConfirm: () => { navigate('/sessions') } })
  }
  return <main className="workspace workspace--reading gm-profile"><ProfileHeading />{confirmationDialog}
    {!profile ? fetching ? <div className="gm-profile-layout gm-profile-loading" aria-busy="true">
      <section className="gm-profile-card gm-profile-personal"><Skeleton lines={2} label="Učitavanje ličnih podataka" /><div className="gm-profile-avatar-placeholder" aria-hidden="true" /><Skeleton lines={6} label="Učitavanje podataka profila" /></section>
      <div className="gm-profile-right"><section className="gm-profile-card gm-profile-password"><Skeleton lines={7} label="Učitavanje bezbednosnih opcija" /></section>
        <section className="gm-profile-card"><Skeleton lines={4} label="Učitavanje informacija o nalogu" /></section></div>
    </div> : <ErrorState title="Profil nije dostupan" message={error || 'Podatke naloga trenutno nije moguće prikazati.'}
      action={<Button type="button" onClick={reload}>Pokušaj ponovo</Button>} />
      : <>
        {error && <ErrorState title="Podaci o nalogu nisu osveženi" message={error}
          action={<Button type="button" variant="secondary" loading={fetching} onClick={reload}>Pokušaj ponovo</Button>} />}
        <div className="gm-profile-layout"><ProfilePersonalCard profile={profile} canUpdate={canUpdate} onSaved={synchronize} onDirty={setPersonalDirty} />
          <div className="gm-profile-right"><ProfilePasswordCard canUpdate={canUpdate} onChanged={reload} onDirty={setPasswordDirty} />
            <ProfileAccountCard profile={profile} canRead={hasCapability(actor, 'PROFILE_READ')} onSessions={openSessions} />
          </div>
        </div>
      </>}
  </main>
}

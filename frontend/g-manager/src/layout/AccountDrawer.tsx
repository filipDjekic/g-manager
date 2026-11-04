import { useId } from 'react'
import { NavLink } from 'react-router-dom'
import { hasCapability } from '../auth/capabilities'
import { AccountAvatar } from '../components/AccountAvatar'
import { Badge, Button, Drawer, Select } from '../components/ui'
import { roleLabels } from '../components/ui/statusPresentation'
import { useUiPreferences } from '../preferences/uiPreferencesContext'
import type { AuthUser } from '../types/auth.types'
import { NavigationIcon } from './NavigationIcon'
import './AccountDrawer.css'

const accountLinks = [
  { to: '/profile', label: 'Lični podaci' },
  { to: '/sessions', label: 'Bezbednost i prijavljeni uređaji' },
  { to: '/notification-preferences', label: 'Podešavanja obaveštenja' },
]

function AccountControlIcon({ kind }: { kind: 'theme' | 'density' | 'logout' }) {
  const paths = {
    theme: 'M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z',
    density: 'M4 4h16v6H4z M4 14h16v6H4z M8 7h8 M8 17h8',
    logout: 'M9 4H4v16h5 M10 12h11 M17 8l4 4-4 4',
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}

export function AccountDrawer({ user, open, onClose, onLogout, loggingOut }: {
  user: AuthUser | null; open: boolean; onClose: () => void; onLogout: () => void; loggingOut: boolean
}) {
  const id = useId()
  const { theme, density, setTheme, setDensity } = useUiPreferences()
  return <Drawer open={open} title="Moj nalog" titleIcon={<NavigationIcon to="/profile" />}
    className="account-drawer" onClose={onClose} closeDisabled={loggingOut}>
    <div className="account-panel">
      {user && <section className="account-profile" aria-label="Podaci prijavljenog korisnika">
        <div className="account-profile-avatar"><AccountAvatar user={{ ...user, avatarUrl: null }} /></div>
        <div className="account-profile-info"><h3>{user.name}</h3><Badge tone="info">{roleLabels[user.role]}</Badge>
          <p>{user.email}</p></div>
      </section>}
      {hasCapability(user, 'PROFILE_READ') && <section className="account-section" aria-labelledby={`${id}-account`}>
        <h3 id={`${id}-account`}>Nalog</h3>
        <nav className="account-links" aria-label="Upravljanje nalogom">
          {accountLinks.map(item => <NavLink key={item.to} to={item.to} onClick={onClose}>
            <span className="account-link-icon"><NavigationIcon to={item.to} /></span><span>{item.label}</span>
            <svg className="account-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </NavLink>)}
        </nav>
      </section>}
      <section className="account-section account-display" aria-labelledby={`${id}-display`}>
        <h3 id={`${id}-display`}>Podešavanja prikaza</h3>
        <div className="account-preferences">
          <label htmlFor={`${id}-theme`}><span className="account-preference-label"><AccountControlIcon kind="theme" />Tema</span>
            <Select id={`${id}-theme`} value={theme} onChange={event => setTheme(event.target.value as 'light' | 'dark')}>
              <option value="dark">Tamna</option><option value="light">Svetla</option>
            </Select>
          </label>
          <label htmlFor={`${id}-density`}><span className="account-preference-label"><AccountControlIcon kind="density" />Prikaz</span>
            <Select id={`${id}-density`} aria-label="Gustina prikaza" value={density}
              onChange={event => setDensity(event.target.value as 'compact' | 'comfortable')}>
              <option value="comfortable">Komforan</option><option value="compact">Kompaktan</option>
            </Select>
          </label>
        </div>
      </section>
      <div className="account-panel-footer"><Button className="account-logout" variant="danger" onClick={onLogout} loading={loggingOut}>
        <AccountControlIcon kind="logout" />Odjavi se
      </Button></div>
    </div>
  </Drawer>
}

import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { useAuthStore } from '../auth/authStore'
import { Button, Drawer, Select } from '../components/ui'
import { useUiPreferences } from '../preferences/uiPreferencesContext'
import { CommandPalette } from '../search/CommandPalette'
import { NotificationCenter } from '../notification/NotificationCenter'
import { ConnectivityBanner } from '../pwa/ConnectivityBanner'
import { useFeatureStore } from '../feature/featureStore'
import { navigationFor } from './navigation'

function Navigation({ close }: { close?: () => void }) {
  const user = useAuthStore((state) => state.user)
  const flags = useFeatureStore((state) => state.flags)
  if (!user) return null
  return <nav className="product-navigation" aria-label="Glavna navigacija">
    {navigationFor(user, flags).map((group) => <section className="navigation-group" key={group.label}>
      <h2>{group.label}</h2>
      {group.items.map((item) => <NavLink key={`${item.label}-${item.to}`} to={item.to}
        onClick={close}>{item.label}</NavLink>)}
    </section>)}
  </nav>
}

function PreferenceControls() {
  const { theme, density, setTheme, setDensity } = useUiPreferences()
  return <div className="shell-preferences">
    <label className="preference-control">Tema<Select aria-label="Tema" value={theme}
      onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}>
      <option value="dark">Tamna</option><option value="light">Svetla</option>
    </Select></label>
    <label className="preference-control">Prikaz<Select aria-label="Gustina prikaza" value={density}
      onChange={(event) => setDensity(event.target.value as 'compact' | 'comfortable')}>
      <option value="comfortable">Komforan</option><option value="compact">Kompaktan</option>
    </Select></label>
  </div>
}

export function AppShell() {
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  async function logout() {
    setIsLoggingOut(true)
    try { await authApi.logout() } finally { clearSession() }
  }

  return <div className="app-shell">
    <ConnectivityBanner />
    <header className="shell-topbar">
      <Button className="mobile-menu-button" variant="secondary" type="button"
        aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(true)}>Meni</Button>
      <NavLink className="shell-brand" to="/">G-Manager</NavLink>
      <div className="shell-actions">
        <CommandPalette />
        <NotificationCenter />
        <span className="shell-user"><strong>{user?.name}</strong><small>{user?.role}</small></span>
        <Button type="button" variant="secondary" onClick={logout} loading={isLoggingOut}>Odjavi se</Button>
      </div>
    </header>
    <aside className="desktop-navigation" aria-label="Bočna navigacija">
      <Navigation />
      <PreferenceControls />
    </aside>
    <Drawer open={menuOpen} title="Navigacija" onClose={() => setMenuOpen(false)}>
      <div id="mobile-navigation" className="mobile-navigation-content">
        <p className="mobile-user"><strong>{user?.name}</strong><span>{user?.role}</span></p>
        <Navigation close={() => setMenuOpen(false)} />
        <PreferenceControls />
      </div>
    </Drawer>
    <div className="shell-content"><Outlet /></div>
  </div>
}

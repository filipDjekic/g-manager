import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Button, Drawer, Select } from '../components/ui'
import { useUiPreferences } from '../preferences/uiPreferencesContext'
import { CommandPalette } from '../search/CommandPalette'
import { NotificationCenter } from '../notification/NotificationCenter'
import { ConnectivityBanner } from '../pwa/ConnectivityBanner'

function Navigation({ close }: { close?: () => void }) {
  const user = useAuthStore((state) => state.user)
  return <nav aria-label="Glavna navigacija" onClick={close}>
    <NavLink to="/">G-Manager</NavLink><NavLink to="/profile">Profil</NavLink>
    <NavLink to="/sessions">Sesije</NavLink><NavLink to="/catalog">Katalog</NavLink>
    <NavLink to="/documents">Dokumenti</NavLink>
    {hasCapability(user, 'REPORT_READ') && <NavLink to="/reports">Izveštaji</NavLink>}
    {(hasCapability(user, 'WORKFLOW_SUBMIT')||hasCapability(user, 'WORKFLOW_ACT')||hasCapability(user, 'WORKFLOW_MANAGE'))&&<NavLink to="/workflows">Workflow</NavLink>}
    {hasCapability(user, 'DASHBOARD_OPERATIONAL') && <NavLink to="/dashboard">Dashboard</NavLink>}
    {hasCapability(user, 'USER_LIST') && <NavLink to="/employees">Zaposleni</NavLink>}
    {hasCapability(user, 'WORKING_HOURS_MANAGE') && <NavLink to="/settings">Radno vreme</NavLink>}
    {hasCapability(user, 'RESERVATION_READ_OWN') && <NavLink to="/my-reservations">Moji termini</NavLink>}
    {hasCapability(user, 'ORDER_READ_OWN') && <NavLink to="/my-orders">Moje narudžbine</NavLink>}
    {hasCapability(user, 'RESERVATION_READ_ALL') && <NavLink to="/reservations">Rezervacije</NavLink>}
    {hasCapability(user, 'ORDER_READ_ALL') && <NavLink to="/orders">Narudžbine</NavLink>}
    {hasCapability(user, 'USER_LIST') && <NavLink to="/users">Korisnici</NavLink>}
    {hasCapability(user, 'AUDIT_READ') && <NavLink to="/audit">Audit</NavLink>}
  </nav>
}

export function AppShell() {
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, density, setTheme, setDensity } = useUiPreferences()

  async function logout() {
    setIsLoggingOut(true)
    try { await authApi.logout() } finally { clearSession() }
  }

  return <div className="app-shell">
    <ConnectivityBanner />
    <header>
      <Button className="mobile-menu-button" variant="secondary" type="button"
        aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>Meni</Button>
      <div className="desktop-navigation"><Navigation /></div>
      <div className="shell-actions">
        <CommandPalette />
        <NotificationCenter />
        <span>{user?.name} · {user?.role}</span>
        <label className="preference-control">Tema<Select aria-label="Tema" value={theme}
          onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}>
          <option value="dark">Tamna</option><option value="light">Svetla</option>
        </Select></label>
        <label className="preference-control">Prikaz<Select aria-label="Gustina prikaza" value={density}
          onChange={(event) => setDensity(event.target.value as 'compact' | 'comfortable')}>
          <option value="comfortable">Komforan</option><option value="compact">Kompaktan</option>
        </Select></label>
        <Button type="button" variant="secondary" onClick={logout} loading={isLoggingOut}>Odjavi se</Button>
      </div>
    </header>
    <Drawer open={menuOpen} title="Navigacija" onClose={() => setMenuOpen(false)}>
      <Navigation close={() => setMenuOpen(false)} />
    </Drawer>
    <Outlet />
  </div>
}

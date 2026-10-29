import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Button, Drawer } from '../components/ui'
import { Select } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { AccountAvatar } from '../components/AccountAvatar'
import { roleLabels } from '../components/ui/statusPresentation'
import { useUiPreferences } from '../preferences/uiPreferencesContext'
import { CommandPalette } from '../search/CommandPalette'
import { NotificationCenter } from '../notification/NotificationCenter'
import { ConnectivityBanner } from '../pwa/ConnectivityBanner'
import { useFeatureStore } from '../feature/featureStore'
import { unsavedWorkState } from '../forms/useDirtyGuard'
import { homeForUser, navigationActive, navigationFor } from './navigation'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import { NavigationIcon } from './NavigationIcon'
import { BrandLogo } from './BrandLogo'

function Navigation({ close, bottom = false }: { close?: () => void; bottom?: boolean }) {
  const user = useAuthStore(state => state.user), flags = useFeatureStore(state => state.flags), location = useLocation()
  if (!user) return null
  return <nav className={bottom ? 'customer-bottom-navigation' : 'product-navigation'} aria-label={bottom ? 'Brza navigacija' : 'Glavna navigacija'}>
    {navigationFor(user, flags).map(group => <section className="navigation-group" key={group.label}>
      <div className="navigation-group-items">{group.items.map(item => <Link key={item.to} to={item.to} title={item.label}
        aria-label={item.label} aria-current={navigationActive(item.to, location.pathname, location.search, user.role) ? 'page' : undefined}
        className={navigationActive(item.to, location.pathname, location.search, user.role) ? 'active' : undefined} onClick={close}>
        <NavigationIcon to={item.to.split('?')[0]} /><span>{item.label}</span></Link>)}</div>
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
  const user = useAuthStore(state => state.user), flags = useFeatureStore(state => state.flags), location = useLocation()
  const clearSession = useAuthStore(state => state.clearSession), toast = useToast()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [isLoggingOut, setIsLoggingOut] = useState(false), [menuOpen, setMenuOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('gmanager.sidebar-collapsed') === 'true' } catch { return false } })
  const current = user ? navigationFor(user, flags).flatMap(group => group.items)
    .find(item => navigationActive(item.to, location.pathname, location.search, user.role)) : undefined
  const home = user ? homeForUser(user, flags) : '/login', userLabel = user ? roleLabels[user.role] : ''
  function toggleSidebar() {
    setCollapsed(!collapsed)
    try { localStorage.setItem('gmanager.sidebar-collapsed', String(!collapsed)) } catch { /* optional preference */ }
  }
  async function performLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try { await authApi.logout() } finally { clearSession() }
  }
  function logout() {
    if (unsavedWorkState() === 'handoff') { toast('Najpre predajte ili preuzmite jednokratni kod i zatvorite njegov prozor.', 'info'); return }
    if (unsavedWorkState() === 'pending') { toast('Prvo proverite ishod prethodnog zahteva.', 'info'); return }
    if (unsavedWorkState() === 'dirty') confirm({ title: 'Odjavi se i odbaci unose?', description: 'Nesačuvani unosi neće ostati na stranici.', variant: 'warning', confirmLabel: 'Odjavi se', onConfirm: performLogout })
    else void performLogout()
  }
  return <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}${user?.role === 'CUSTOMER' ? ' customer-shell' : ''}`}>
    <ConnectivityBanner />{confirmationDialog}
    <header className="shell-topbar">
      <Button iconOnly className="mobile-menu-button" variant="secondary" aria-label="Meni" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(true)}>&#9776;</Button>
      <Link className="shell-brand shell-brand--mobile" to={home} aria-label="G-Manager početna"><BrandLogo className="brand-mark" /><span>G-MANAGER</span></Link>
      <div className="shell-page-context"><small>{userLabel}</small><strong>{current?.label ?? 'Moj nalog'}</strong></div>
      <div className="shell-search"><CommandPalette /></div>
      <div className="shell-actions"><NotificationCenter /><Button className="shell-account-button" variant="secondary" onClick={() => setAccountOpen(true)}
        aria-label={`Moj nalog: ${user?.name ?? ''}, ${userLabel}`} aria-haspopup="dialog" aria-expanded={accountOpen}>
        <span className="shell-avatar" aria-hidden="true"><AccountAvatar user={user} /></span>
        <span className="shell-user"><strong>{user?.name}</strong><small>Moj nalog</small></span></Button></div>
    </header>
    <aside className="desktop-navigation" aria-label="Bočna navigacija"><div className="sidebar-heading">
      <Link className="shell-brand" to={home} aria-label="G-Manager početna"><BrandLogo className="brand-mark" /><span>G-MANAGER</span></Link>
    </div><Navigation /><div className="sidebar-footer"><Button className="sidebar-toggle" variant="secondary" aria-expanded={!collapsed}
      aria-label={collapsed ? 'Proširi navigaciju' : 'Sažmi navigaciju'} onClick={toggleSidebar}><span aria-hidden="true">⇔</span><span>Sažmi navigaciju</span></Button></div></aside>
    <Drawer open={menuOpen} title="Navigacija" onClose={() => setMenuOpen(false)}><div id="mobile-navigation" className="mobile-navigation-content">
      <p className="mobile-user"><strong>{user?.name}</strong><span>{userLabel}</span></p><Navigation close={() => setMenuOpen(false)} />
    </div></Drawer>
    <Drawer open={accountOpen} title="Moj nalog" onClose={() => setAccountOpen(false)} closeDisabled={isLoggingOut}>
      <div className="form-grid"><div><strong>{user?.name}</strong><p>{user?.email}</p><small>{userLabel}</small></div>
        {hasCapability(user, 'PROFILE_READ') && <><Link onClick={() => setAccountOpen(false)} to="/profile">Lični podaci →</Link>
          <Link onClick={() => setAccountOpen(false)} to="/sessions">Bezbednost i prijavljeni uređaji →</Link>
          <Link onClick={() => setAccountOpen(false)} to="/notification-preferences">Podešavanja obaveštenja →</Link></>}
        <PreferenceControls /><Button variant="danger" onClick={logout} loading={isLoggingOut}>Odjavi se</Button>
      </div>
    </Drawer>
    <div className="shell-content"><WorkspaceNavigation /><Outlet key={[user?.id,user?.role,...user?.permissions??[]].join(':')} /></div>
    {user?.role === 'CUSTOMER' && <Navigation bottom />}
  </div>
}

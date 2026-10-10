import { useEffect, useId, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { useAuthStore } from '../auth/authStore'
import { Button, Drawer, Select } from '../components/ui'
import { roleLabels } from '../components/ui/statusPresentation'
import { useUiPreferences } from '../preferences/uiPreferencesContext'
import { CommandPalette } from '../search/CommandPalette'
import { NotificationCenter } from '../notification/NotificationCenter'
import { ConnectivityBanner } from '../pwa/ConnectivityBanner'
import { useFeatureStore } from '../feature/featureStore'
import { homeForUser, navigationFor } from './navigation'
import { NavigationIcon } from './NavigationIcon'
import { BrandLogo } from './BrandLogo'
import { hasCapability } from '../auth/capabilities'

function Navigation({ close, collapsed = false, groups, toggleGroup }: {
  close?: () => void; collapsed?: boolean; groups: string[]; toggleGroup: (label: string) => void
}) {
  const user = useAuthStore((state) => state.user)
  const flags = useFeatureStore((state) => state.flags)
  const id = useId()
  if (!user) return null
  return <nav className="product-navigation" aria-label="Glavna navigacija">
    {navigationFor(user, flags).map((group, index) => {
      const expanded = collapsed || !groups.includes(group.label)
      return <section className="navigation-group" key={group.label}>
        <button className="navigation-group-toggle" type="button" aria-expanded={expanded}
          aria-controls={`${id}-group-${index}`} onClick={() => toggleGroup(group.label)}>
          <span>{group.label}</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
        <div id={`${id}-group-${index}`} className="navigation-group-items" hidden={!expanded}>
          {group.items.map((item) => <NavLink end key={item.to} to={item.to} title={item.label} aria-label={item.label}
            onClick={close}><NavigationIcon to={item.to} /><span>{item.label}</span></NavLink>)}
        </div>
      </section>
    })}
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
  const flags = useFeatureStore((state) => state.flags)
  const clearSession = useAuthStore((state) => state.clearSession)
  const location = useLocation()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('gmanager.sidebar-collapsed') === 'true' } catch { return false }
  })
  const [groups, setGroups] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem('gmanager.navigation-groups') ?? '[]')
      return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []
    } catch { return [] }
  })
  const current = user ? navigationFor(user, flags).flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))
    .find((item) => item.to === location.pathname) : undefined
  useEffect(() => {
    if (!current?.group) return
    setGroups((stored) => stored.includes(current.group) ? stored.filter((label) => label !== current.group) : stored)
  }, [current?.group])
  function toggleSidebar() {
    setCollapsed(!collapsed)
    try { localStorage.setItem('gmanager.sidebar-collapsed', String(!collapsed)) } catch { /* optional preference */ }
  }
  function toggleGroup(label: string) {
    const next = groups.includes(label) ? groups.filter((value) => value !== label) : [...groups, label]
    setGroups(next)
    try { localStorage.setItem('gmanager.navigation-groups', JSON.stringify(next)) } catch { /* optional preference */ }
  }
  async function logout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try { await authApi.logout() } finally { clearSession() }
  }
  const userLabel = user ? roleLabels[user.role] : ''
  const home = user ? homeForUser(user, flags) : '/'
  return <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}${user?.role === 'CUSTOMER' ? ' customer-shell' : ''}`}>
    <ConnectivityBanner />
    <header className="shell-topbar">
      <Button className="mobile-menu-button" variant="secondary" type="button"
        aria-label="Meni" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(true)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </Button>
      <NavLink className="shell-brand shell-brand--mobile" to={home} aria-label="G-Manager početna">
        <BrandLogo className="brand-mark" /><span>G-MANAGER</span>
      </NavLink>
      <div className="shell-page-context"><small>{current?.group ?? 'Moj prostor'}</small><strong>{current?.label ?? 'G-Manager'}</strong></div>
      <div className="shell-search"><CommandPalette /></div>
      <div className="shell-actions">
        {hasCapability(user, 'RESERVATION_READ_ALL') && location.pathname !== '/reservations' && <NavLink className="shell-quick-action" to="/reservations">Rezervacije →</NavLink>}
        <NotificationCenter />
        <Button className="shell-account-button" type="button" variant="secondary" onClick={() => setAccountOpen(true)}
          aria-label={`Moj nalog: ${user?.name ?? ''}, ${userLabel}`} aria-haspopup="dialog" aria-expanded={accountOpen}>
          <span className="shell-avatar" aria-hidden="true">{user?.name.slice(0, 1).toLocaleUpperCase('sr')}</span>
          <span className="shell-user"><strong>{user?.name}</strong><small>{userLabel}</small></span>
          <svg className="shell-account-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true" focusable="false"><path d="m7 10 5 5 5-5" /></svg>
        </Button>
      </div>
    </header>
    <aside className="desktop-navigation" aria-label="Bočna navigacija">
      <div className="sidebar-heading">
        <NavLink className="shell-brand" to={home} aria-label="G-Manager početna" title="G-Manager">
          <BrandLogo className="brand-mark" /><span>G-MANAGER</span>
        </NavLink>
      </div>
      <Navigation collapsed={collapsed} groups={groups} toggleGroup={toggleGroup} />
      <div className="sidebar-footer">
        <PreferenceControls />
        <Button className="sidebar-toggle" type="button" variant="secondary" aria-expanded={!collapsed}
          aria-label={collapsed ? 'Proširi navigaciju' : 'Sažmi navigaciju'}
          title={collapsed ? 'Proširi navigaciju' : 'Sažmi navigaciju'} onClick={toggleSidebar}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
            <path d={collapsed ? 'm13 9 3 3-3 3' : 'm16 9-3 3 3 3'} />
          </svg>
          <span>Sažmi navigaciju</span>
        </Button>
      </div>
    </aside>
    <Drawer open={menuOpen} title="Navigacija" onClose={() => setMenuOpen(false)}>
      <div id="mobile-navigation" className="mobile-navigation-content">
        <NavLink className="shell-brand" to={home} onClick={() => setMenuOpen(false)} aria-label="G-Manager početna">
          <BrandLogo className="brand-mark" /><span>G-MANAGER</span>
        </NavLink>
        <p className="mobile-user"><strong>{user?.name}</strong><span>{userLabel}</span></p>
        <Navigation close={() => setMenuOpen(false)} groups={groups} toggleGroup={toggleGroup} />
        <PreferenceControls />
      </div>
    </Drawer>
    <Drawer open={accountOpen} title="Moj nalog" onClose={() => setAccountOpen(false)} closeDisabled={isLoggingOut}>
      <div className="form-grid"><div><strong>{user?.name}</strong><p>{user?.email}</p><small>{userLabel}</small></div>
        {hasCapability(user, 'PROFILE_READ') && <><Link onClick={() => setAccountOpen(false)} to="/profile">Profil →</Link>
          <Link onClick={() => setAccountOpen(false)} to="/sessions">Aktivne sesije →</Link></>}
        <PreferenceControls />
        <Button type="button" variant="danger" onClick={() => void logout()} loading={isLoggingOut}>Odjavi se</Button>
      </div>
    </Drawer>
    <div className="shell-content"><Outlet /></div>
  </div>
}

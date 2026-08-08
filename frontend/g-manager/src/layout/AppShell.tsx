import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'

export function AppShell() {
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function logout() {
    setIsLoggingOut(true)
    try {
      await authApi.logout()
    } finally {
      clearSession()
    }
  }

  return (
    <div className="app-shell">
      <header>
        <nav><NavLink to="/">G-Manager</NavLink><NavLink to="/profile">Profil</NavLink>
          <NavLink to="/catalog">Katalog</NavLink>
          {hasCapability(user, 'DASHBOARD_OPERATIONAL') && <NavLink to="/dashboard">Dashboard</NavLink>}
          {hasCapability(user, 'USER_LIST') && <NavLink to="/employees">Zaposleni</NavLink>}
          {hasCapability(user, 'WORKING_HOURS_MANAGE') && <NavLink to="/settings">Radno vreme</NavLink>}
          {hasCapability(user, 'RESERVATION_READ_OWN') && <NavLink to="/my-reservations">Moji termini</NavLink>}
          {hasCapability(user, 'ORDER_READ_OWN') && <NavLink to="/my-orders">Moje narudžbine</NavLink>}
          {hasCapability(user, 'RESERVATION_READ_ALL') && <NavLink to="/reservations">Rezervacije</NavLink>}
          {hasCapability(user, 'ORDER_READ_ALL') && <NavLink to="/orders">Narudžbine</NavLink>}
          {hasCapability(user, 'USER_LIST') && <NavLink to="/users">Korisnici</NavLink>}
        </nav>
        <div>
          <span>{user?.name} · {user?.role}</span>
          <button type="button" onClick={logout} disabled={isLoggingOut}>
            {isLoggingOut ? 'Odjava…' : 'Odjavi se'}
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}

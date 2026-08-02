import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { authApi } from '../api/authApi'
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
          {(user?.role === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'EMPLOYEE')
            && <NavLink to="/dashboard">Dashboard</NavLink>}
          {(user?.role === 'OWNER' || user?.role === 'ADMIN') && <NavLink to="/employees">Zaposleni</NavLink>}
          {(user?.role === 'OWNER' || user?.role === 'ADMIN') && <NavLink to="/settings">Radno vreme</NavLink>}
          {user?.role === 'CUSTOMER' && <NavLink to="/my-reservations">Moji termini</NavLink>}
          {user?.role === 'CUSTOMER' && <NavLink to="/my-orders">Moje narudžbine</NavLink>}
          {(user?.role === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'EMPLOYEE')
            && <NavLink to="/reservations">Rezervacije</NavLink>}
          {(user?.role === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'EMPLOYEE')
            && <NavLink to="/orders">Narudžbine</NavLink>}
          {user?.role === 'OWNER' && <NavLink to="/users">Korisnici</NavLink>}
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

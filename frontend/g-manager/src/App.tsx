import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { initializeSession } from './api/client'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RoleGuard } from './auth/RoleGuard'
import { AppShell } from './layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { SessionPage } from './pages/SessionPage'
import { ProfilePage } from './pages/ProfilePage'
import { UserManagementPage } from './pages/UserManagementPage'
import { CatalogPage } from './pages/CatalogPage'
import { SettingsPage } from './pages/SettingsPage'
import { MyReservationsPage } from './pages/MyReservationsPage'
import { ReservationsPage } from './pages/ReservationsPage'
import { MyOrdersPage } from './pages/MyOrdersPage'
import { OrdersPage } from './pages/OrdersPage'
import './App.css'

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))

function App() {
  useEffect(() => {
    void initializeSession()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/unauthorized" element={<main className="screen-message">Nemate dozvolu za ovu stranicu.</main>} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route element={<RoleGuard allowedRoles={['OWNER', 'ADMIN', 'EMPLOYEE', 'CUSTOMER']} />}>
              <Route index element={<SessionPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="catalog" element={<CatalogPage />} />
            </Route>
            <Route element={<RoleGuard allowedRoles={['OWNER', 'ADMIN']} />}>
              <Route path="employees" element={<UserManagementPage employeesOnly />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route element={<RoleGuard allowedRoles={['CUSTOMER']} />}>
              <Route path="my-reservations" element={<MyReservationsPage />} />
              <Route path="my-orders" element={<MyOrdersPage />} />
            </Route>
            <Route element={<RoleGuard allowedRoles={['OWNER', 'ADMIN', 'EMPLOYEE']} />}>
              <Route path="dashboard" element={
                <Suspense fallback={<p className="screen-message">Učitavanje dashboarda…</p>}>
                  <DashboardPage />
                </Suspense>
              } />
              <Route path="reservations" element={<ReservationsPage />} />
              <Route path="orders" element={<OrdersPage />} />
            </Route>
            <Route element={<RoleGuard allowedRoles={['OWNER']} />}>
              <Route path="users" element={<UserManagementPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

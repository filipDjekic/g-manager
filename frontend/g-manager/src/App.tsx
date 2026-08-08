import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { initializeSession } from './api/client'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { CapabilityGuard } from './auth/CapabilityGuard'
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
            <Route element={<CapabilityGuard anyOf={['PROFILE_READ']} />}>
              <Route index element={<SessionPage />} />
              <Route path="sessions" element={<SessionPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="catalog" element={<CatalogPage />} />
            </Route>
            <Route element={<CapabilityGuard anyOf={['USER_LIST']} />}>
              <Route path="employees" element={<UserManagementPage employeesOnly />} />
            </Route>
            <Route element={<CapabilityGuard anyOf={['WORKING_HOURS_MANAGE']} />}>
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route element={<CapabilityGuard anyOf={['RESERVATION_READ_OWN', 'ORDER_READ_OWN']} />}>
              <Route path="my-reservations" element={<MyReservationsPage />} />
              <Route path="my-orders" element={<MyOrdersPage />} />
            </Route>
            <Route element={<CapabilityGuard anyOf={['DASHBOARD_SUMMARY', 'DASHBOARD_OPERATIONAL']} />}>
              <Route path="dashboard" element={
                <Suspense fallback={<p className="screen-message">Učitavanje dashboarda…</p>}>
                  <DashboardPage />
                </Suspense>
              } />
              <Route path="reservations" element={<ReservationsPage />} />
              <Route path="orders" element={<OrdersPage />} />
            </Route>
            <Route element={<CapabilityGuard anyOf={['USER_LIST']} />}>
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

import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { initializeSession } from './api/client'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { CapabilityGuard } from './auth/CapabilityGuard'
import { RouteAccessibility } from './accessibility/RouteAccessibility'
import { AppShell } from './layout/AppShell'
import './App.css'
import { useFeatureStore } from './feature/featureStore'
import { FeatureUnavailable } from './feature/FeatureUnavailable'
import { useAuthStore } from './auth/authStore'
import { homeForRole } from './layout/navigation'

const lazyPage = <T extends Record<K, ComponentType>, K extends keyof T>(
  loader: () => Promise<T>, name: K,
) => lazy(() => loader().then((module) => ({ default: module[name] })))

const LoginPage = lazyPage(() => import('./pages/LoginPage'), 'LoginPage')
const ActivatePage = lazyPage(() => import('./pages/ActivatePage'), 'ActivatePage')
const SessionPage = lazyPage(() => import('./pages/SessionPage'), 'SessionPage')
const ProfilePage = lazyPage(() => import('./pages/ProfilePage'), 'ProfilePage')
const UserManagementPage = lazyPage(() => import('./pages/UserManagementPage'), 'UserManagementPage')
const CustomersPage = lazyPage(() => import('./pages/CustomersPage'), 'CustomersPage')
const CatalogPage = lazyPage(() => import('./pages/CatalogPage'), 'CatalogPage')
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'), 'SettingsPage')
const MyReservationsPage = lazyPage(() => import('./pages/MyReservationsPage'), 'MyReservationsPage')
const ReservationsPage = lazyPage(() => import('./pages/ReservationsPage'), 'ReservationsPage')
const CalendarPage = lazyPage(() => import('./pages/CalendarPage'), 'CalendarPage')
const MyOrdersPage = lazyPage(() => import('./pages/MyOrdersPage'), 'MyOrdersPage')
const OrdersPage = lazyPage(() => import('./pages/OrdersPage'), 'OrdersPage')
const AuditPage = lazyPage(() => import('./pages/AuditPage'), 'AuditPage')
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'), 'DashboardPage')
const NotificationPreferencesPage = lazyPage(() => import('./pages/NotificationPreferencesPage'), 'NotificationPreferencesPage')
const DocumentsPage = lazyPage(() => import('./pages/DocumentsPage'), 'DocumentsPage')
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'), 'ReportsPage')
const WorkflowsPage = lazyPage(() => import('./pages/WorkflowsPage'), 'WorkflowsPage')
const FeatureFlagsPage = lazyPage(() => import('./pages/FeatureFlagsPage'), 'FeatureFlagsPage')
const ResourcesPage = lazyPage(() => import('./pages/ResourcesPage'), 'ResourcesPage')

function RouteLoading() {
  return <p className="screen-message" role="status">Učitavanje stranice…</p>
}

function HomeRedirect() {
  const user = useAuthStore((state) => state.user)
  return <Navigate to={user ? homeForRole(user.role) : '/login'} replace />
}

function App() {
  const reportsEnabled = useFeatureStore((state) => state.flags.REPORTS)
  const workflowsEnabled = useFeatureStore((state) => state.flags.WORKFLOWS)
  useEffect(() => {
    void initializeSession()
  }, [])

  return (
    <BrowserRouter>
      <RouteAccessibility />
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/activate" element={<ActivatePage />} />
          <Route path="/unauthorized" element={<main className="screen-message">Nemate dozvolu za ovu stranicu.</main>} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route element={<CapabilityGuard anyOf={['PROFILE_READ']} />}>
                <Route index element={<HomeRedirect />} />
                <Route path="sessions" element={<SessionPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="catalog" element={<CatalogPage />} />
                <Route path="notification-preferences" element={<NotificationPreferencesPage />} />
                <Route path="documents" element={<DocumentsPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['RESOURCE_READ']} />}>
                <Route path="resources" element={<ResourcesPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['USER_LIST']} />}>
                <Route path="employees" element={<UserManagementPage employeesOnly />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['CUSTOMER_READ']} />}>
                <Route path="customers" element={<CustomersPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['WORKING_HOURS_MANAGE']} />}>
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['RESERVATION_READ_OWN', 'ORDER_READ_OWN']} />}>
                <Route path="my-reservations" element={<MyReservationsPage />} />
                <Route path="my-orders" element={<MyOrdersPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['DASHBOARD_SUMMARY', 'DASHBOARD_OPERATIONAL']} />}>
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="reservations" element={<ReservationsPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="orders" element={<OrdersPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['USER_LIST']} />}>
                <Route path="users" element={<UserManagementPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['AUDIT_READ']} />}>
                <Route path="audit" element={<AuditPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['REPORT_READ']} />}><Route path="reports" element={reportsEnabled ? <ReportsPage /> : <FeatureUnavailable />} /></Route>
              <Route element={<CapabilityGuard anyOf={['WORKFLOW_SUBMIT','WORKFLOW_ACT','WORKFLOW_MANAGE']} />}><Route path="workflows" element={workflowsEnabled ? <WorkflowsPage /> : <FeatureUnavailable />} /></Route>
              <Route element={<CapabilityGuard anyOf={['FEATURE_FLAG_MANAGE']} />}><Route path="features" element={<FeatureFlagsPage />} /></Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App

import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, Route, Routes, RouterProvider, useLocation } from 'react-router-dom'
import { NavigationSafety } from './forms/NavigationSafety'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { CapabilityGuard } from './auth/CapabilityGuard'
import { RouteAccessibility } from './accessibility/RouteAccessibility'
import './App.css'
import './styles/product.css'
import { useFeatureStore } from './feature/featureStore'
import { reportFrontendError } from './observability/errorReporter'
import { useAuthStore } from './auth/authStore'
import { homeForUser } from './layout/navigation'

const lazyPage = <T extends Record<K, ComponentType>, K extends keyof T>(
  loader: () => Promise<T>, name: K,
) => lazy(() => loader().then((module) => ({ default: module[name] })))

const AppShell = lazyPage(() => import('./layout/AppShell'), 'AppShell')
const RouteStatePage = lazy(() => import('./pages/RouteStatePage').then(module => ({ default: module.RouteStatePage })))
const FeatureUnavailable = lazyPage(() => import('./feature/FeatureUnavailable'), 'FeatureUnavailable')
const LoginPage = lazyPage(() => import('./pages/LoginPage'), 'LoginPage')
const ActivatePage = lazyPage(() => import('./pages/ActivatePage'), 'ActivatePage')
const SessionPage = lazyPage(() => import('./pages/SessionPage'), 'SessionPage')
const ProfilePage = lazyPage(() => import('./pages/ProfilePage'), 'ProfilePage')
const UserManagementPage = lazyPage(() => import('./pages/UserManagementPage'), 'UserManagementPage')
const EmployeesPage = lazyPage(() => import('./pages/EmployeesPage'), 'EmployeesPage')
const CustomersPage = lazyPage(() => import('./pages/CustomersPage'), 'CustomersPage')
const CatalogPage = lazyPage(() => import('./pages/CatalogPage'), 'CatalogPage')
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'), 'SettingsPage')
const EmployeeTimeOffPage = lazyPage(() => import('./pages/EmployeeTimeOffPage'), 'EmployeeTimeOffPage')
const MyReservationsPage = lazyPage(() => import('./pages/MyReservationsPage'), 'MyReservationsPage')
const ReservationsPage = lazyPage(() => import('./pages/ReservationsPage'), 'ReservationsPage')
const CalendarPage = lazyPage(() => import('./pages/CalendarPage'), 'CalendarPage')
const MyOrdersPage = lazyPage(() => import('./pages/MyOrdersPage'), 'MyOrdersPage')
const OrdersPage = lazyPage(() => import('./pages/OrdersPage'), 'OrdersPage')
const AuditPage = lazyPage(() => import('./pages/AuditPage'), 'AuditPage')
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'), 'DashboardPage')
const NotificationPreferencesPage = lazyPage(() => import('./pages/NotificationPreferencesPage'), 'NotificationPreferencesPage')
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'), 'ReportsPage')
const ResourcesPage = lazyPage(() => import('./pages/ResourcesPage'), 'ResourcesPage')
const StationsPage = lazyPage(() => import('./pages/StationsPage'), 'StationsPage')
const GamingSessionsPage = lazyPage(() => import('./pages/GamingSessionsPage'), 'GamingSessionsPage')
const CustomerHomePage = lazyPage(() => import('./pages/CustomerHomePage'), 'CustomerHomePage')
const WaitlistPage = lazyPage(() => import('./pages/WaitlistPage'), 'WaitlistPage')
const WorkspaceHubPage = lazy(() => import('./pages/WorkspaceHubPage').then(module => ({ default: module.WorkspaceHubPage })))

function RouteLoading() {
  return <p className="screen-message" role="status">Učitavanje stranice…</p>
}

function HomeRedirect() {
  const user = useAuthStore((state) => state.user)
  const flags = useFeatureStore((state) => state.flags)
  return <Navigate to={user ? homeForUser(user, flags) : '/login'} replace />
}

function SettingsRoute() {
  const { hash, search } = useLocation()
  return hash === '#time-off' || hash === '#timeoff'
    ? <Navigate to={{ pathname: '/employee-time-off', search }} replace />
    : <SettingsPage />
}

function AppRoutes() {
  const reportsEnabled = useFeatureStore((state) => state.flags.REPORTS)
  useEffect(() => {
    void import('./api/client').then(({ initializeSession }) => initializeSession()).catch(error => {
      reportFrontendError(error, 'session.initialize')
      useAuthStore.getState().finishInitialization()
    })
  }, [])

  return (
    <>
      <NavigationSafety />
      <RouteAccessibility />
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/activate" element={<ActivatePage />} />
          <Route path="/unauthorized" element={<RouteStatePage kind="unauthorized" />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<HomeRedirect />} />
              <Route element={<CapabilityGuard anyOf={['USER_LIST', 'CATALOG_MANAGE', 'WORKING_HOURS_MANAGE', 'REPORT_READ', 'AUDIT_READ']} />}>
                <Route path="management" element={<WorkspaceHubPage kind="management" />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['RESOURCE_READ']} />}>
                <Route path="equipment" element={<WorkspaceHubPage kind="equipment" />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['CATALOG_READ', 'RESOURCE_READ', 'STATION_READ', 'REPORT_READ']} />}>
                <Route path="tools" element={<WorkspaceHubPage kind="tools" />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['PROFILE_READ']} />}>
                <Route path="sessions" element={<SessionPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="notification-preferences" element={<NotificationPreferencesPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['CATALOG_READ']} />}>
                <Route path="catalog" element={<CatalogPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['RESOURCE_READ']} />}>
                <Route path="resources" element={<ResourcesPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['STATION_READ']} />}>
                <Route path="stations" element={<StationsPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['GAMING_SESSION_READ']} />}>
                <Route path="gaming-sessions" element={<GamingSessionsPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['USER_LIST']} />}>
                <Route path="employees" element={<EmployeesPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['CUSTOMER_READ']} />}>
                <Route path="customers" element={<CustomersPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['WORKING_HOURS_MANAGE']} />}>
                <Route path="settings" element={<SettingsRoute />} />
                <Route path="employee-time-off" element={<EmployeeTimeOffPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['RESERVATION_READ_OWN', 'ORDER_READ_OWN']} />}>
                <Route path="home" element={<CustomerHomePage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['RESERVATION_READ_OWN']} />}>
                <Route path="my-reservations" element={<MyReservationsPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['ORDER_READ_OWN']} />}>
                <Route path="my-orders" element={<MyOrdersPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['DASHBOARD_SUMMARY', 'DASHBOARD_OPERATIONAL']} />}>
                <Route path="dashboard" element={<DashboardPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['RESERVATION_READ_ALL']} />}>
                <Route path="reservations" element={<ReservationsPage />} />
                <Route path="calendar" element={<CalendarPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['ORDER_READ_ALL']} />}>
                <Route path="orders" element={<OrdersPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['RESERVATION_READ_ALL']} />}>
                <Route path="waitlist" element={<WaitlistPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['USER_LIST']} />}>
                <Route path="users" element={<UserManagementPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['AUDIT_READ']} />}>
                <Route path="audit" element={<AuditPage />} />
              </Route>
              <Route element={<CapabilityGuard anyOf={['REPORT_READ']} />}><Route path="reports" element={reportsEnabled ? <ReportsPage /> : <FeatureUnavailable />} /></Route>
            </Route>
          </Route>
          <Route path="*" element={<RouteStatePage kind="missing" />} />
        </Routes>
      </Suspense>
    </>
  )
}

const router = createBrowserRouter([{ path: '*', element: <AppRoutes /> }])
export default function App() { return <RouterProvider router={router} /> }

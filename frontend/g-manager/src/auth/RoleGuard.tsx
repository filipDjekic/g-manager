import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from './authStore'
import type { Role } from '../types/auth.types'

export function RoleGuard({ allowedRoles }: { allowedRoles: Role[] }) {
  const role = useAuthStore((state) => state.user?.role)
  return role && allowedRoles.includes(role) ? <Outlet /> : <Navigate to="/unauthorized" replace />
}

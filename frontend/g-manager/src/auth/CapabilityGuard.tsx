import { Navigate, Outlet } from 'react-router-dom'
import type { Permission } from '../types/auth.types'
import { useAuthStore } from './authStore'
import { hasCapability } from './capabilities'

export function CapabilityGuard({ anyOf }: { anyOf: Permission[] }) {
  const user = useAuthStore((state) => state.user)
  return anyOf.some((permission) => hasCapability(user, permission))
    ? <Outlet />
    : <Navigate to="/unauthorized" replace />
}

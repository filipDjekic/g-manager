import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'

export function SessionPage() {
  const user = useAuthStore((state) => state.user)
  return <Navigate to={user?.role === 'CUSTOMER' ? '/catalog' : '/dashboard'} replace />
}

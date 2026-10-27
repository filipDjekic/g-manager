import type { QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth/authStore'
import type { AuthUser } from '../types/auth.types'

const scope = (user: AuthUser | null) => user ? JSON.stringify([user.id, user.role, user.permissions?.slice().sort()]) : ''

/** Shared query keys must never retain the previous actor's grants or private responses. */
export function installSessionCacheBoundary(client: QueryClient) {
  return useAuthStore.subscribe((state, previous) => {
    if (scope(state.user) !== scope(previous.user)) client.clear()
  })
}

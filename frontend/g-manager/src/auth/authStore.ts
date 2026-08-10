import { create } from 'zustand'
import type { AuthUser } from '../types/auth.types'
import { purgePrivateData } from '../pwa/clientStorage'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isInitializing: boolean
  setSession: (accessToken: string, user: AuthUser) => void
  updateUser: (user: AuthUser) => void
  clearSession: () => void
  finishInitialization: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isInitializing: true,
  setSession: (accessToken, user) => {
    const previous = get().user?.id
    if (previous && previous !== user.id) void purgePrivateData(previous).catch(() => undefined)
    set({ accessToken, user, isInitializing: false })
  },
  updateUser: (user) => set({ user }),
  clearSession: () => {
    const previous = get().user?.id
    set({ accessToken: null, user: null, isInitializing: false })
    if (previous) void purgePrivateData(previous).catch(() => undefined)
  },
  finishInitialization: () => set({ isInitializing: false }),
}))

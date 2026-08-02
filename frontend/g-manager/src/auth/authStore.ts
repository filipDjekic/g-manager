import { create } from 'zustand'
import type { AuthUser } from '../types/auth.types'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isInitializing: boolean
  setSession: (accessToken: string, user: AuthUser) => void
  updateUser: (user: AuthUser) => void
  clearSession: () => void
  finishInitialization: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isInitializing: true,
  setSession: (accessToken, user) => set({ accessToken, user, isInitializing: false }),
  updateUser: (user) => set({ user }),
  clearSession: () => set({ accessToken: null, user: null, isInitializing: false }),
  finishInitialization: () => set({ isInitializing: false }),
}))

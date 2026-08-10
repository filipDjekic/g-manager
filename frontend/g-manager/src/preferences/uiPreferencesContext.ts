import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark'
export type Density = 'compact' | 'comfortable'
export interface Preferences {
  theme: Theme
  density: Density
  setTheme: (theme: Theme) => void
  setDensity: (density: Density) => void
}
export const UiPreferencesContext = createContext<Preferences | null>(null)
export function useUiPreferences(): Preferences {
  const value = useContext(UiPreferencesContext)
  if (!value) throw new Error('useUiPreferences requires UiPreferencesProvider')
  return value
}

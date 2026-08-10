import { useEffect, useState, type ReactNode } from 'react'
import {
  UiPreferencesContext, type Density, type Preferences, type Theme,
} from './uiPreferencesContext'

const STORAGE_KEY = 'gmanager.ui-preferences.v1'

function readPreferences(): Pick<Preferences, 'theme' | 'density'> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Preferences>
    return {
      theme: stored.theme === 'light' ? 'light' : 'dark',
      density: stored.density === 'compact' ? 'compact' : 'comfortable',
    }
  } catch {
    return { theme: 'dark', density: 'comfortable' }
  }
}

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => readPreferences())
  const [theme, setTheme] = useState<Theme>(initial.theme)
  const [density, setDensity] = useState<Density>(initial.density)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.density = density
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, density }))
  }, [density, theme])
  return <UiPreferencesContext.Provider value={{ theme, density, setTheme, setDensity }}>
    {children}
  </UiPreferencesContext.Provider>
}

import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useListUrlState<T extends Record<string, string>>(defaults: T, allowed: readonly (keyof T)[]) {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => Object.fromEntries(allowed.map((key) => {
    const value = params.get(String(key))
    return [key, value ?? defaults[key]]
  })) as T, [allowed, defaults, params])

  useEffect(() => {
    try { localStorage.setItem('gmanager.recent-filter', params.toString()) } catch { /* storage is optional */ }
  }, [params])

  const set = useCallback((changes: Partial<T>, replace = false) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([key, raw]) => {
      const value = String(raw ?? '')
      if (!value || value === defaults[key]) next.delete(key)
      else next.set(key, value)
    })
    setParams(next, { replace })
  }, [defaults, params, setParams])

  const apply = useCallback((query: Record<string, string>) => {
    const next = new URLSearchParams()
    allowed.forEach((key) => { const value = query[String(key)]; if (value) next.set(String(key), value) })
    setParams(next)
  }, [allowed, setParams])

  return { state, set, apply, query: params.toString(), queryObject: Object.fromEntries(params.entries()) }
}

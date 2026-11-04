import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { apiErrorMessage } from '../api/client'
import { useAuthStore } from '../auth/authStore'
import { useToast } from '../components/ui/toastContext'
import type { SecurityEventInfo, SessionInfo } from '../types/auth.types'

export interface SessionResource<T> { data: T[] | null; loading: boolean; error: string }

export function useSessionDashboard(actorId: string) {
  const [sessions, setSessions] = useState<SessionResource<SessionInfo>>({ data: null, loading: true, error: '' })
  const [events, setEvents] = useState<SessionResource<SecurityEventInfo>>({ data: null, loading: true, error: '' })
  const [pendingId, setPendingId] = useState<string | null>(null)
  const loadingRequest = useRef<Promise<void> | null>(null)
  const mutationInFlight = useRef(false), mounted = useRef(false)
  const client = useQueryClient()
  const toast = useToast(), navigate = useNavigate()
  const currentActor = useCallback(() => useAuthStore.getState().user?.id === actorId, [actorId])

  const load = useCallback((): Promise<void> => {
    if (loadingRequest.current) return loadingRequest.current
    if (!mounted.current || !currentActor()) return Promise.resolve()
    setSessions(current => ({ ...current, loading: true, error: '' }))
    setEvents(current => ({ ...current, loading: true, error: '' }))
    const active = () => mounted.current && currentActor()
    const request = Promise.all([
      client.invalidateQueries({ queryKey: ['security-history', actorId] }),
      authApi.sessions().then(data => {
        if (active()) setSessions({ data, loading: false, error: '' })
      }).catch(cause => {
        if (active()) setSessions(current => ({ ...current, loading: false, error: apiErrorMessage(cause, 'Aktivne sesije trenutno nisu dostupne.') }))
      }),
      authApi.securityEvents().then(data => {
        if (active()) setEvents({ data, loading: false, error: '' })
      }).catch(cause => {
        if (active()) setEvents(current => ({ ...current, loading: false, error: apiErrorMessage(cause, 'Bezbednosna istorija trenutno nije dostupna.') }))
      }),
    ]).then(() => undefined).finally(() => { loadingRequest.current = null })
    loadingRequest.current = request
    return request
  }, [currentActor, client, actorId])

  useEffect(() => {
    mounted.current = true
    // Cancel the deferred mount request during cleanup, including StrictMode replay.
    const initial = window.setTimeout(() => { void load() }, 0)
    return () => { mounted.current = false; window.clearTimeout(initial) }
  }, [load])

  const refresh = () => mutationInFlight.current ? Promise.resolve() : load()

  async function revoke(session: SessionInfo) {
    if (mutationInFlight.current || loadingRequest.current || !currentActor()) throw new Error('Session operation unavailable')
    mutationInFlight.current = true
    setPendingId(session.id)
    try {
      await authApi.revokeSession(session.id)
      if (!currentActor()) return
      if (session.current) {
        useAuthStore.getState().clearSession()
        navigate('/login', { replace: true })
        return
      }
      if (!mounted.current) return
      // Remove only after the server has acknowledged revocation.
      setSessions(current => ({ ...current, data: current.data?.filter(value => value.id !== session.id) ?? null }))
      toast('Izabrani uređaj je odjavljen.', 'success')
      await load()
    } finally {
      mutationInFlight.current = false
      if (mounted.current && currentActor()) setPendingId(null)
    }
  }

  async function revokeAll() {
    if (mutationInFlight.current || loadingRequest.current || !currentActor()) throw new Error('Session operation unavailable')
    mutationInFlight.current = true
    setPendingId('all')
    try {
      await authApi.revokeAllSessions()
      if (!currentActor()) return
      // Do not refresh data or the revoked login after this acknowledgement.
      useAuthStore.getState().clearSession()
      navigate('/login', { replace: true })
    } finally {
      mutationInFlight.current = false
      if (mounted.current && currentActor()) setPendingId(null)
    }
  }

  return { sessions, events, pendingId, refresh, revoke, revokeAll, fetching: sessions.loading || events.loading }
}

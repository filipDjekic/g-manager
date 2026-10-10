import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { authApi } from '../api/authApi'
import { useAuthStore } from '../auth/authStore'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Badge, EmptyState, Skeleton, TableShell } from '../components/ui'
import type { SecurityEventInfo, SecurityEventType, SessionInfo } from '../types/auth.types'

const eventLabels: Record<SecurityEventType, string> = {
  LOGIN_SUCCESS: 'Uspešna prijava', LOGIN_FAILURE: 'Neuspešna prijava',
  TOKEN_REFRESH: 'Sesija osvežena', TOKEN_REUSE: 'Otkrivena ponovna upotreba tokena',
  SESSION_REVOKED: 'Sesija opozvana', ALL_SESSIONS_REVOKED: 'Sve sesije opozvane',
  LOGOUT: 'Odjava',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('sr-Latn-RS', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value))
}

export function SessionPage() {
  const navigate = useNavigate()
  const clearSession = useAuthStore((state) => state.clearSession)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [events, setEvents] = useState<SecurityEventInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [showRevokeAll, setShowRevokeAll] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [sessionData, eventData] = await Promise.all([
        authApi.sessions(), authApi.securityEvents(),
      ])
      setSessions(sessionData)
      setEvents(eventData)
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Sesije trenutno nisu dostupne.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.all([authApi.sessions(), authApi.securityEvents()])
      .then(([sessionData, eventData]) => { setSessions(sessionData); setEvents(eventData) })
      .catch((requestError) => setError(apiErrorMessage(requestError, 'Sesije trenutno nisu dostupne.')))
      .finally(() => setIsLoading(false))
  }, [])

  async function revoke(session: SessionInfo) {
    setPendingId(session.id)
    setError('')
    try {
      await authApi.revokeSession(session.id)
      if (session.current) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }
      setMessage('Izabrana sesija je opozvana.')
      await load()
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Sesija nije mogla biti opozvana.'))
    } finally {
      setPendingId(null)
    }
  }

  async function revokeAll() {
    setPendingId('all')
    setError('')
    try {
      await authApi.revokeAllSessions()
      clearSession()
      navigate('/login', { replace: true })
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Sesije nisu mogle biti opozvane.'))
      setPendingId(null)
      throw requestError
    }
  }

  return <main className="workspace">
    <div className="page-heading">
      <div><p className="eyebrow">Bezbednost naloga</p><h1>Aktivne sesije</h1></div>
      {sessions.length > 0 && <button className="danger-button" type="button"
        onClick={() => setShowRevokeAll(true)}>Opozovi sve sesije</button>}
    </div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {message && <p className="success-banner" role="status">{message}</p>}
    {isLoading ? <Skeleton lines={4} label="Učitavanje sesija" /> : sessions.length === 0
      ? <EmptyState title="Nema aktivnih sesija" />
      : <div className="session-list">{sessions.map((session) =>
        <article className={`panel session-card${session.current ? ' current' : ''}`} key={session.id}>
          <div><h2>{session.deviceLabel}</h2>
            {session.current && <Badge tone="info">Ovaj uređaj</Badge>}</div>
          <p title={session.userAgentSummary}>Poslednja aktivnost: {formatDate(session.lastSeenAt)}</p>
          <p>Prijavljena: {formatDate(session.createdAt)} · Ističe: {formatDate(session.expiresAt)}</p>
          <button type="button" className="danger-button" disabled={pendingId === session.id}
            onClick={() => void revoke(session)}>
            {pendingId === session.id ? 'Opozivanje…' : session.current ? 'Odjavi ovaj uređaj' : 'Opozovi sesiju'}
          </button>
        </article>)}</div>}

    <section className="security-history"><h2>Bezbednosna istorija</h2>
      {events.length === 0 ? <p className="empty-state compact">Još nema događaja.</p>
        : <TableShell label="Bezbednosna istorija"><table className="responsive-table"><thead><tr><th>Događaj</th><th>Uređaj</th><th>Vreme</th></tr></thead>
          <tbody>{events.map((event, index) => <tr key={`${event.occurredAt}-${index}`}>
            <td data-label="Događaj">{eventLabels[event.type]}</td><td data-label="Uređaj">{event.deviceLabel}</td><td data-label="Vreme">{formatDate(event.occurredAt)}</td>
          </tr>)}</tbody></table></TableShell>}
    </section>

    <ConfirmDialog open={showRevokeAll} title="Opozovi sve sesije" variant="danger" confirmLabel="Opozovi sve"
      description="Bićete odjavljeni i svi uređaji će morati ponovo da se prijave."
      loading={pendingId === 'all'} autoClose={false} onClose={() => setShowRevokeAll(false)} onConfirm={revokeAll} />
  </main>
}

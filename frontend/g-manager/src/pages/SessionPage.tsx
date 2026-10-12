import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Card, ErrorState } from '../components/ui'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ActiveDevices, SecurityHistory, SessionHeading, SessionKpis } from '../sessions/SessionDashboardViews'
import { SessionIcon, SessionTime, type SecurityFilter } from '../sessions/sessionPresentation'
import { useSessionDashboard } from '../sessions/useSessionDashboard'
import type { SessionInfo } from '../types/auth.types'
import '../sessions/sessions.css'

type RevocationSelection = { kind: 'session'; session: SessionInfo } | { kind: 'all' }

export function SessionPage() {
  const actor = useAuthStore(state => state.user)
  if (!actor || !hasCapability(actor, 'PROFILE_READ')) return <main className="workspace gm-session">
    <SessionHeading /><ErrorState title="Pristup nije dozvoljen" message="Nemate dozvolu za pregled aktivnih sesija." />
  </main>
  return <SessionWorkspace key={actor.id} actorId={actor.id} canChangePassword={hasCapability(actor, 'PROFILE_UPDATE')} />
}

function SessionWorkspace({ actorId, canChangePassword }: { actorId: string; canChangePassword: boolean }) {
  const dashboard = useSessionDashboard(actorId)
  const [selection, setSelection] = useState<RevocationSelection | null>(null)
  const [filter, setFilter] = useState<SecurityFilter>('all')
  const devicesHeading = useRef<HTMLHeadingElement>(null)
  const selectedRevoked = useRef(false)
  const busy = dashboard.fetching || dashboard.pendingId !== null
  const refresh = () => { void dashboard.refresh() }
  const tokenReuse = dashboard.events.data?.some(event => event.type === 'TOKEN_REUSE') ?? false

  function openConfirmation(value: RevocationSelection) {
    if (busy) return
    selectedRevoked.current = false
    setSelection(value)
  }

  function closeConfirmation() {
    setSelection(null)
    if (selectedRevoked.current) {
      selectedRevoked.current = false
      // A removed row cannot receive the shared dialog's restored focus.
      window.requestAnimationFrame(() => devicesHeading.current?.focus({ preventScroll: true }))
    }
  }

  async function confirmRevocation() {
    if (!selection) return
    if (selection.kind === 'all') await dashboard.revokeAll()
    else {
      await dashboard.revoke(selection.session)
      selectedRevoked.current = !selection.session.current
    }
  }

  return <main className="workspace gm-session">
    <SessionHeading fetching={dashboard.fetching} disabled={dashboard.pendingId !== null} onRefresh={refresh} />
    <SessionKpis sessions={dashboard.sessions} events={dashboard.events} />
    {tokenReuse && <Card className="gm-session-risk">
      <SessionIcon kind="alert" />
      <div><h2>Proverite bezbednost naloga</h2>
        <p>U dostupnoj istoriji zabeležena je neuobičajena bezbednosna aktivnost. Preporučujemo proveru aktivnih sesija i promenu lozinke.</p>
      </div>
      {canChangePassword && <Link className="ui-button ui-button--secondary" to="/profile">Promeni lozinku</Link>}
    </Card>}
    <ActiveDevices resource={dashboard.sessions} busy={busy} pendingId={dashboard.pendingId} headingRef={devicesHeading}
      onRetry={refresh} onRevoke={session => openConfirmation({ kind: 'session', session })}
      onRevokeAll={() => openConfirmation({ kind: 'all' })} />
    <SecurityHistory resource={dashboard.events} filter={filter} busy={busy} onFilter={setFilter} onRetry={refresh} />
    <p className="gm-session-timezone"><SessionIcon kind="info" />Datumi i vremena prikazani su za Europe/Belgrade.</p>
    <ConfirmDialog open={selection !== null} className="gm-session-dialog" variant="danger"
      title={selection?.kind === 'all' ? 'Odjavi sve sesije' : 'Odjavi uređaj'}
      titleIcon={<SessionIcon kind="alert" />}
      confirmLabel={selection?.kind === 'all' ? 'Odjavi sve sesije' : 'Odjavi uređaj'} cancelLabel="Otkaži"
      loading={dashboard.pendingId !== null} disabled={dashboard.fetching}
      errorMessage={selection?.kind === 'all' ? 'Sesije nisu mogle biti odjavljene. Pokušajte ponovo.' : 'Izabrani uređaj nije mogao biti odjavljen. Pokušajte ponovo.'}
      onClose={closeConfirmation} onConfirm={confirmRevocation}
      description={selection?.kind === 'all'
        ? 'Ova akcija će prekinuti sve aktivne prijave na vašem nalogu, uključujući uređaj koji trenutno koristite. Moraćete ponovo da se prijavite.'
        : selection?.kind === 'session' ? <div className="gm-session-confirmation">
          <p>Da li želite da prekinete prijavu na izabranom uređaju?</p>
          <dl><div><dt>Uređaj</dt><dd>{selection.session.deviceLabel || 'Nepoznat uređaj'}</dd></div>
            <div><dt>Poslednja aktivnost</dt><dd><SessionTime value={selection.session.lastSeenAt} /></dd></div></dl>
          {selection.session.current && <p className="gm-session-current-warning">Ovo je uređaj koji trenutno koristite. Nakon odjavljivanja moraćete ponovo da se prijavite.</p>}
        </div> : ''} />
  </main>
}

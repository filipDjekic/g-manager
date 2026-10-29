import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { waitlistApi } from '../api/waitlistApi'
import { Badge, Button, EmptyState, ErrorState, Skeleton, StatCard } from '../components/ui'
import { useGamingOperations } from './useGamingOperations'
import { useServerNow } from './useServerNow'
import { needsAttention, remaining, stationLabels } from './presentation'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'

export function GamingOverview() {
  const { board, connection } = useGamingOperations(), now = useServerNow(board.data?.serverTime)
  const actor=useAuthStore(state=>state.user),canWaitlist=hasCapability(actor,'RESERVATION_READ_ALL')
  const waitlist = useQuery({ queryKey:['waitlist','operational','summary'], queryFn:() => waitlistApi.operational({page:0,size:1}), refetchInterval:60000, enabled:canWaitlist })
  const stations = board.data?.stations ?? [], attention = stations.filter(needsAttention)
  const expiring = stations.filter((s) => s.sessionId && s.endsAt && Date.parse(s.endsAt)-now <= 600000)
  const actionable = [...attention, ...expiring.filter((s) => !attention.includes(s))].slice(0,6)
  return <section className="gaming-overview" aria-labelledby="gaming-overview-title">
    <header className="section-heading"><div><p className="eyebrow">Operativni pregled</p><h2 id="gaming-overview-title">Gaming uživo</h2></div><Link className="ui-button ui-button--primary ui-button--medium" to="/gaming-sessions">Otvori gaming operativu →</Link></header>
    {board.isLoading ? <Skeleton lines={3} label="Učitavanje gaming pregleda" /> : board.error ? <ErrorState title="Gaming stanje nije potvrđeno" message="Osvežite pregled da biste dobili trenutno stanje stanica." action={<Button variant="secondary" onClick={() => board.refetch()}>Pokušaj ponovo</Button>} /> : !stations.length ?
      <EmptyState title="Gaming stanice još nisu dostupne" description="Proverite konfiguraciju i dodeljene lokacije." action={hasCapability(actor,'STATION_READ') && <Link to="/stations">Pregled stanica</Link>} /> : <>
        <div className="ui-stat-grid operations-metrics">
          <StatCard to="/gaming-sessions?ready=true" label="Slobodne stanice" value={stations.filter((s) => s.allowedActions.includes('START')).length} />
          <StatCard to="/gaming-sessions?sessions=true" label="Aktivne sesije" value={stations.filter((s) => s.sessionId).length} />
          <StatCard to="/gaming-sessions?expiring=true" label="Ističe za ≤10 min" value={expiring.length} tone="warning" />
          <StatCard to="/gaming-sessions?attention=true" label="Stanice za proveru" value={attention.length} tone="accent" />
        </div>
        {!!actionable.length && <ul className="operations-attention-list">{actionable.map((s) => <li key={s.resourceId}><Link to={`/gaming-sessions?stationId=${s.resourceId}`}><strong>{s.resourceName}</strong><span>{s.customerDisplayName ?? s.locationName ?? 'Gaming stanica'}</span></Link>
          <Badge tone={needsAttention(s) ? 'warning' : 'accent'}>{needsAttention(s) ? s.staleHeartbeat ? 'Veza zastarela' : s.commandSequence&&!s.commandAcknowledgedAt ? 'Komanda čeka potvrdu' : stationLabels[s.status] : `Još ${remaining((Date.parse(s.endsAt!)-now)/1000)}`}</Badge></li>)}</ul>}
      </>}
    <div className="live-status"><Badge tone={connection === 'connected' ? 'success' : 'info'}>{connection === 'connected' ? 'Veza uživo' : 'Periodično osvežavanje'}</Badge>
      {canWaitlist&&<Link to="/waitlist">Lista čekanja{waitlist.data ? ` · ${waitlist.data.totalElements}` : waitlist.error ? ' · nedostupna' : ''}</Link>}{hasCapability(actor,'RESERVATION_READ_ALL')&&<Link to="/reservations?status=PENDING">Rezervacije na čekanju</Link>}{hasCapability(actor,'ORDER_READ_ALL')&&<Link to="/orders">Aktivne narudžbine</Link>}</div>
  </section>
}

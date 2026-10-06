import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { waitlistApi } from '../api/waitlistApi'
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
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
    <header className="section-heading"><div><p className="eyebrow">Operativni pregled</p><h2 id="gaming-overview-title">Gaming uživo</h2></div><Link className="button-link" to="/gaming-sessions">Otvori gaming operativu →</Link></header>
    {board.isLoading ? <Skeleton lines={3} label="Učitavanje gaming pregleda" /> : board.error ? <ErrorState title="Gaming stanje nije potvrđeno" message="Osvežite pregled da biste dobili trenutno stanje stanica." action={<Button onClick={() => board.refetch()}>Pokušaj ponovo</Button>} /> : !stations.length ?
      <EmptyState title="Gaming stanice još nisu dostupne" description="Proverite konfiguraciju i dodeljene lokacije." action={<Link to="/stations">Pregled stanica</Link>} /> : <>
        <div className="operations-metrics">
          <Link className="operation-metric" to="/gaming-sessions?ready=true"><span>Slobodne stanice</span><strong>{stations.filter((s) => s.allowedActions.includes('START')).length}</strong></Link>
          <Link className="operation-metric" to="/gaming-sessions?sessions=true"><span>Aktivne sesije</span><strong>{stations.filter((s) => s.sessionId).length}</strong></Link>
          <Link className="operation-metric accent" to="/gaming-sessions?expiring=true"><span>Ističe za ≤10 min</span><strong>{expiring.length}</strong></Link>
          <Link className="operation-metric" to="/gaming-sessions?attention=true"><span>Stanice za proveru</span><strong>{attention.length}</strong></Link>
        </div>
        {!!actionable.length && <ul className="operations-attention-list">{actionable.map((s) => <li key={s.resourceId}><Link to={`/gaming-sessions?stationId=${s.resourceId}`}><strong>{s.resourceName}</strong><span>{s.customerDisplayName ?? s.locationName ?? 'Gaming stanica'}</span></Link>
          <Badge tone={needsAttention(s) ? 'warning' : 'accent'}>{needsAttention(s) ? s.staleHeartbeat ? 'Veza zastarela' : s.commandSequence&&!s.commandAcknowledgedAt ? 'Komanda čeka potvrdu' : stationLabels[s.status] : `Još ${remaining((Date.parse(s.endsAt!)-now)/1000)}`}</Badge></li>)}</ul>}
      </>}
    <div className="live-status"><Badge tone={connection === 'connected' ? 'success' : 'info'}>{connection === 'connected' ? 'Live veza' : 'Periodično osvežavanje'}</Badge>
      {canWaitlist&&<Link to="/waitlist">Lista čekanja{waitlist.data ? ` · ${waitlist.data.totalElements}` : waitlist.error ? ' · nedostupna' : ''}</Link>}{hasCapability(actor,'RESERVATION_READ_ALL')&&<Link to="/reservations?status=PENDING">Rezervacije na čekanju</Link>}{hasCapability(actor,'ORDER_READ_ALL')&&<Link to="/orders">Aktivne narudžbine</Link>}</div>
  </section>
}

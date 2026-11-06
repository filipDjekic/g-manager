import { Link } from 'react-router-dom'
import { Badge, EmptyState } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { GamingSessionVisit } from '../types/gamingSession.types'
import { remaining } from './presentation'
import { useServerNow } from './useServerNow'

export function GamingVisitList({visits,staff=false,locale='sr-RS',showDuration=false}:{visits:GamingSessionVisit[];staff?:boolean;locale?:string;showDuration?:boolean}) {
  const now=useServerNow(visits[0]?.serverTime)
  if(!visits.length)return <EmptyState title="Nema gaming sesija" description="Sesije će se pojaviti nakon prvog igranja."/>
  return <div className="gaming-visit-list">{visits.map(visit=><article key={visit.id} className={`gaming-visit${visit.status==='ACTIVE'?' current':''}`}>
    <div><strong>{visit.resourceName}</strong><Badge tone={visit.status==='ACTIVE'?'info':'neutral'}>{visit.status==='ACTIVE'?'Aktivna sesija':visit.status==='EXPIRED'?'Istekla':'Završena'}</Badge></div>
    {visit.status==='ACTIVE'&&<strong className="gaming-countdown">{remaining((Date.parse(visit.endsAt)-now)/1000)}</strong>}
    <p>{formatBusinessDateTime(visit.startedAt,false,locale)} - {formatBusinessDateTime(visit.endedAt??visit.endsAt,false,locale)}</p>
    {visit.billingMode === 'TIME_BALANCE' && <p>Potrošeno: {remaining(visit.billedSeconds ?? 0)}. Preostalo vreme čuva se na nalogu.</p>}
    {visit.billingMode === 'PREPAID_METERED' && <p>Ranija sesija: {visit.billedSeconds ?? 0} s / {visit.chargedAmount ?? 0} RSD</p>}
    {showDuration && <small>{visit.endedAt ? 'Trajanje' : 'Planirano trajanje'}: {Math.max(0, Math.round((Date.parse(visit.endedAt??visit.endsAt)-Date.parse(visit.startedAt))/60000))} min</small>}
    {staff&&visit.status==='ACTIVE'&&<Link to={`/gaming-sessions?stationId=${visit.resourceId}`}>Otvori stanicu →</Link>}
  </article>)}<small>{visits.length} sesija na ovoj stranici{staff?' iz dostupnih lokacija':''}.</small></div>
}

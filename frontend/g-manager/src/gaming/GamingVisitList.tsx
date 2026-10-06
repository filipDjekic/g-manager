import { Link } from 'react-router-dom'
import { Badge, EmptyState } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { GamingSessionVisit } from '../types/gamingSession.types'
import { remaining } from './presentation'
import { useServerNow } from './useServerNow'

export function GamingVisitList({visits,staff=false}:{visits:GamingSessionVisit[];staff?:boolean}) {
  const now=useServerNow(visits[0]?.serverTime)
  if(!visits.length)return <EmptyState title="Nema gaming sesija" description="Sesije će se pojaviti nakon prvog igranja."/>
  return <div className="gaming-visit-list">{visits.map(visit=><article key={visit.id} className={`gaming-visit${visit.status==='ACTIVE'?' current':''}`}>
    <div><strong>{visit.resourceName}</strong><Badge tone={visit.status==='ACTIVE'?'info':'neutral'}>{visit.status==='ACTIVE'?'Aktivna sesija':visit.status==='EXPIRED'?'Istekla':'Završena'}</Badge></div>
    {visit.status==='ACTIVE'&&<strong className="gaming-countdown">{remaining((Date.parse(visit.endsAt)-now)/1000)}</strong>}
    <p>{formatBusinessDateTime(visit.startedAt)} — {formatBusinessDateTime(visit.endedAt??visit.endsAt)}</p>
    {staff&&visit.status==='ACTIVE'&&<Link to={`/gaming-sessions?stationId=${visit.resourceId}`}>Otvori stanicu →</Link>}
  </article>)}<small>Poslednjih {visits.length} sesija{staff?' iz dostupnih lokacija':''}.</small></div>
}

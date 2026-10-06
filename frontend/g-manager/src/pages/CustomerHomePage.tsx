import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { reservationApi } from '../api/reservationApi'
import { orderApi } from '../api/orderApi'
import { waitlistApi } from '../api/waitlistApi'
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { GamingVisitList } from '../gaming/GamingVisitList'
import { useServerNow } from '../gaming/useServerNow'
import { formatBusinessDateTime, todayInBusinessZone } from '../reservations/dateTime'

const orderLabels = { CREATED:'Primljena',IN_PROGRESS:'U pripremi',READY:'Spremna za preuzimanje',COMPLETED:'Završena',CANCELLED:'Otkazana' }
export function CustomerHomePage() {
  const user=useAuthStore(state=>state.user)
  const now=useServerNow()
  const visits=useQuery({queryKey:['gaming-visits','mine'],queryFn:gamingSessionApi.mine,refetchInterval:15000})
  const reservations=useQuery({queryKey:['customer-home','reservations'],queryFn:()=>reservationApi.mine({page:0,size:10,from:todayInBusinessZone(),status:'CONFIRMED',sort:'startTime',direction:'ASC'}),refetchInterval:60000})
  const orders=useQuery({queryKey:['customer-home','orders'],queryFn:()=>orderApi.mine({page:0,size:5,sort:'createdAt',direction:'DESC'}),refetchInterval:30000})
  const queue=useQuery({queryKey:['customer-home','waitlist'],queryFn:waitlistApi.mine,refetchInterval:30000})
  const next=reservations.data?.content.find(value=>Date.parse(value.startTime)>now)
  const active=visits.data?.filter(value=>value.status==='ACTIVE')??[]
  const waiting=queue.data?.filter(value=>value.status==='WAITING'||value.status==='OFFERED')??[]
  return <main className="workspace customer-home">
    <PageHeader eyebrow="Vaš gaming prostor" title={`Zdravo, ${user?.name??'dobro došli'}`} actions={<Link className="button-link" to="/my-reservations">Rezerviši termin →</Link>}/>
    <section className="customer-hero"><div><p className="eyebrow">Spremni za sledeću partiju?</p><h2>Vaše vreme. Vaša stanica.</h2><p>Gaming sesije, termini i narudžbine na jednom mestu.</p></div><div className="form-actions"><Link className="button-link" to="/catalog">Istraži ponudu</Link><Link to="/resources">Pogledaj resurse →</Link></div></section>
    <section className="today-section"><h2>Aktivna gaming sesija</h2>
      {visits.isLoading?<Skeleton lines={3}/>:visits.error?<ErrorState message="Sesije nisu dostupne." action={<Button onClick={()=>visits.refetch()}>Pokušaj ponovo</Button>}/>:active.length?<GamingVisitList visits={active}/>:<EmptyState title="Trenutno ne igrate" description="Osoblje pokreće sesiju kada dođete u igraonicu." action={<Link to="/my-reservations">Rezervišite svoj termin</Link>}/>}
    </section>
    <div className="today-columns"><section className="panel"><h2>Sledeći potvrđeni termin</h2>
      {reservations.isLoading?<Skeleton lines={2}/>:reservations.error?<ErrorState message="Termini nisu dostupni." action={<Button onClick={()=>reservations.refetch()}>Pokušaj ponovo</Button>}/>:next?<><Badge tone="success">Potvrđeno</Badge><strong>{formatBusinessDateTime(next.startTime)}</strong><Link to={`/my-reservations?reservationId=${next.id}`}>Detalji termina →</Link></>:<EmptyState title="Nemate predstojeći potvrđeni termin" action={<Link to="/my-reservations">Termini i zakazivanje</Link>}/>}
    </section><section className="panel"><h2>Lista čekanja</h2>
      {queue.isLoading?<Skeleton lines={2}/>:queue.error?<ErrorState message="Lista čekanja nije dostupna." action={<Button onClick={()=>queue.refetch()}>Pokušaj ponovo</Button>}/>:!waiting.length?<p>Nemate aktivne prijave.</p>:<ul className="history-list">{waiting.map(entry=><li key={entry.id}><Badge tone={entry.status==='OFFERED'?'success':'warning'}>{entry.status==='OFFERED'?'Termin je ponuđen':'Čeka slobodan termin'}</Badge><span>{formatBusinessDateTime(entry.desiredStart)}</span>{entry.offerExpiresAt&&<small>Ponuda važi do {formatBusinessDateTime(entry.offerExpiresAt)}</small>}</li>)}</ul>}<Link to="/my-reservations">Upravljaj terminima i ponudama →</Link>
    </section></div>
    <section className="today-section"><div className="section-heading"><h2>Poslednje narudžbine</h2><Link to="/my-orders">Sve narudžbine →</Link></div>
      {orders.isLoading?<Skeleton lines={3}/>:orders.error?<ErrorState message="Narudžbine nisu dostupne." action={<Button onClick={()=>orders.refetch()}>Pokušaj ponovo</Button>}/>:!orders.data?.content.length?<EmptyState title="Još nemate narudžbine" action={<Link to="/catalog">Pogledajte ponudu</Link>}/>:<div className="panel-grid">{orders.data.content.map(order=><article className="panel" key={order.id}><Badge tone={order.status==='READY'?'success':order.status==='CANCELLED'?'danger':'info'}>{orderLabels[order.status]}</Badge><strong>{order.totalPrice.toLocaleString('sr-RS')} RSD</strong><small>{formatBusinessDateTime(order.createdAt)}</small></article>)}</div>}
    </section>
    <details className="panel"><summary>Gaming istorija</summary>{visits.data&&<GamingVisitList visits={visits.data.filter(value=>value.status!=='ACTIVE')}/>}</details>
  </main>
}

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { reservationApi } from '../api/reservationApi'
import { orderApi } from '../api/orderApi'
import { waitlistApi } from '../api/waitlistApi'
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { orderLabels, orderTones } from '../components/ui/statusPresentation'
import { GamingVisitList } from '../gaming/GamingVisitList'
import { useServerNow } from '../gaming/useServerNow'
import { formatBusinessDateTime, todayInBusinessZone } from '../reservations/dateTime'

export function CustomerHomePage() {
  const user = useAuthStore((state) => state.user)
  const canReserve = hasCapability(user, 'RESERVATION_READ_OWN'), canOrder = hasCapability(user, 'ORDER_READ_OWN')
  const visits = useQuery({ queryKey: ['gaming-visits', 'mine'], queryFn: gamingSessionApi.mine, refetchInterval: 15000, enabled: canReserve })
  const now = useServerNow(visits.data?.[0]?.serverTime)
  const reservations = useQuery({ queryKey: ['customer-home', 'reservations'], queryFn: () => reservationApi.mine({
    page: 0, size: 10, from: todayInBusinessZone(), status: 'CONFIRMED', sort: 'startTime', direction: 'ASC' }), refetchInterval: 60000, enabled: canReserve })
  const orders = useQuery({ queryKey: ['customer-home', 'orders'], queryFn: () => orderApi.mine({ page: 0, size: 5, sort: 'createdAt', direction: 'DESC' }), refetchInterval: 30000, enabled: canOrder })
  const queue = useQuery({ queryKey: ['customer-home', 'waitlist'], queryFn: waitlistApi.mine, refetchInterval: 30000, enabled: canReserve })
  const next = reservations.data?.content.find((value) => Date.parse(value.startTime) > now)
  const active = visits.data?.filter((value) => value.status === 'ACTIVE') ?? []
  const waiting = queue.data?.filter((value) => value.status === 'WAITING' || value.status === 'OFFERED') ?? []
  return <main className="workspace customer-home">
    <PageHeader eyebrow="Vaš gaming prostor" title={`Zdravo, ${user?.name ?? 'dobro došli'}`} actions={canReserve &&
      <Link className="button-link" to="/my-reservations">Rezerviši termin →</Link>} />
    <section className="customer-hero"><div><p className="eyebrow">{active.length ? 'Partija je u toku' : 'Spremni za sledeću partiju?'}</p>
      <h2>{active.length ? 'Vaša sesija je na prvom mestu.' : 'Vaše vreme. Vaša stanica.'}</h2><p>Gaming sesije, termini i narudžbine na jednom mestu.</p></div>
      <div className="form-actions">{hasCapability(user, 'CATALOG_READ') && <Link className="button-link" to="/catalog">Istraži ponudu</Link>}
        {hasCapability(user, 'RESOURCE_READ') && <Link to="/resources">Pogledaj resurse →</Link>}</div></section>
    {canReserve && <><section className="today-section"><div className="section-heading"><h2>Aktivna gaming sesija</h2><small>Stanje se osvežava na 15 sekundi</small></div>
      {visits.isLoading ? <Skeleton lines={3} /> : visits.error ? <ErrorState message="Sesije nisu dostupne." action={<Button onClick={() => visits.refetch()}>Pokušaj ponovo</Button>} /> :
        active.length ? <GamingVisitList visits={active} /> : <EmptyState title="Trenutno ne igrate" description="Osoblje pokreće sesiju kada dođete u igraonicu." action={<Link to="/my-reservations">Rezervišite svoj termin</Link>} />}
    </section>
    <div className="today-columns"><section className="panel"><h2>Sledeći potvrđeni termin</h2>
      {reservations.isLoading ? <Skeleton lines={2} /> : reservations.error ? <ErrorState message="Termini nisu dostupni." action={<Button onClick={() => reservations.refetch()}>Pokušaj ponovo</Button>} /> : next ?
        <><Badge tone="success">Potvrđeno</Badge><strong>{next.serviceName ?? 'Zakazani termin'}</strong><time dateTime={next.startTime}>{formatBusinessDateTime(next.startTime)}</time>
          {next.resourceName && <small>{next.resourceName}{next.locationName && ` · ${next.locationName}`}</small>}<Link to={`/my-reservations?reservationId=${next.id}`}>Detalji termina →</Link></> :
        <EmptyState title="Nemate predstojeći potvrđeni termin" action={<Link to="/my-reservations">Termini i zakazivanje</Link>} />}
    </section><section className="panel"><h2>Lista čekanja</h2>
      {queue.isLoading ? <Skeleton lines={2} /> : queue.error ? <ErrorState message="Lista čekanja nije dostupna." action={<Button onClick={() => queue.refetch()}>Pokušaj ponovo</Button>} /> :
        !waiting.length ? <p>Nemate aktivne prijave.</p> : <ul className="history-list">{waiting.map((entry) => <li key={entry.id}>
          <Badge tone={entry.status === 'OFFERED' ? 'success' : 'warning'}>{entry.status === 'OFFERED' ? 'Termin je ponuđen' : 'Čeka slobodan termin'}</Badge>
          <span>{formatBusinessDateTime(entry.desiredStart)}</span>{entry.offerExpiresAt && <small>Ponuda važi do {formatBusinessDateTime(entry.offerExpiresAt)}</small>}</li>)}</ul>}
      <Link to="/my-reservations">Upravljaj terminima i ponudama →</Link>
    </section></div></>}
    {canOrder && <section className="today-section"><div className="section-heading"><h2>Poslednje narudžbine</h2><Link to="/my-orders">Sve narudžbine →</Link></div>
      {orders.isLoading ? <Skeleton lines={3} /> : orders.error ? <ErrorState message="Narudžbine nisu dostupne." action={<Button onClick={() => orders.refetch()}>Pokušaj ponovo</Button>} /> :
        !orders.data?.content.length ? <EmptyState title="Još nemate narudžbine" action={hasCapability(user, 'CATALOG_READ') && <Link to="/catalog">Pogledajte ponudu</Link>} /> :
        <div className="panel-grid">{orders.data.content.map((order) => <article className="panel" key={order.id}><Badge tone={orderTones[order.status]}>{orderLabels[order.status]}</Badge>
          <strong>{order.totalPrice.toLocaleString('sr-RS')} RSD</strong><small>{formatBusinessDateTime(order.createdAt)}</small><Link to="/my-orders">Pregled narudžbina →</Link></article>)}</div>}
    </section>}
    {canReserve && <details className="panel"><summary>Gaming istorija</summary>{visits.data && <GamingVisitList visits={visits.data.filter((value) => value.status !== 'ACTIVE')} />}</details>}
  </main>
}

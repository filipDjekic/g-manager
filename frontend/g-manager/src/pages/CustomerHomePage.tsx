import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { reservationApi } from '../api/reservationApi'
import { orderApi } from '../api/orderApi'
import { waitlistApi } from '../api/waitlistApi'
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { reservationLabels, reservationTones } from '../components/ui/statusPresentation'
import { DashboardOrderCard, DashboardSection } from '../dashboard/DashboardComponents'
import { formatDashboardDate } from '../dashboard/presentation'
import { GamingVisitList } from '../gaming/GamingVisitList'
import { useServerNow } from '../gaming/useServerNow'
import { NavigationIcon } from '../layout/NavigationIcon'
import { dateInBusinessZone, formatBusinessDateTime, formatBusinessTime, todayInBusinessZone } from '../reservations/dateTime'
import '../dashboard/dashboard.css'

export function CustomerHomePage() {
  const user = useAuthStore((state) => state.user)
  const canReserve = hasCapability(user, 'RESERVATION_READ_OWN'), canOrder = hasCapability(user, 'ORDER_READ_OWN')
  const canCreateReservation = canReserve && hasCapability(user, 'RESERVATION_CREATE')
  const visits = useQuery({ queryKey: ['gaming-visits', 'mine'], queryFn: gamingSessionApi.mine, refetchInterval: 15000, enabled: canReserve })
  const now = useServerNow(visits.data?.[0]?.serverTime)
  const reservations = useQuery({ queryKey: ['customer-home', 'reservations'], queryFn: () => reservationApi.mine({
    page: 0, size: 10, from: todayInBusinessZone(), status: 'CONFIRMED', sort: 'startTime', direction: 'ASC' }), refetchInterval: 60000, enabled: canReserve })
  const orders = useQuery({ queryKey: ['customer-home', 'orders'], queryFn: () => orderApi.mine({ page: 0, size: 5, sort: 'createdAt', direction: 'DESC' }), refetchInterval: 30000, enabled: canOrder })
  const queue = useQuery({ queryKey: ['customer-home', 'waitlist'], queryFn: waitlistApi.mine, refetchInterval: 30000, enabled: canReserve })
  const queueNow = useServerNow(queue.data?.[0]?.serverTime)
  const next = reservations.data?.content.find((value) => Date.parse(value.startTime) > now)
  const active = visits.data?.filter((value) => value.status === 'ACTIVE') ?? []
  const history = visits.data?.filter((value) => value.status !== 'ACTIVE') ?? []
  const waiting = queue.data?.filter((value) => value.status === 'WAITING' || value.status === 'OFFERED') ?? []

  return <main className="workspace g-dashboard dashboard-customer">
    <section className="dashboard-customer-hero" aria-labelledby="customer-welcome">
      <div className="dashboard-hero-content">
        <p className="eyebrow">Gaming Home · Vaš gaming prostor</p>
        <h1 id="customer-welcome">Zdravo, {user?.name ?? 'dobro došli'}</h1>
        <h2>{active.length && !visits.error ? 'Partija je u toku.' : 'Vaše vreme. Vaša stanica.'}</h2>
        <p>Gaming sesije, termini i narudžbine na jednom mestu. Sve je spremno za vaš sledeći gaming trenutak.</p>
        <div className="dashboard-hero-actions">
          {canCreateReservation ? <Link className="button-link" to="/my-reservations">
            <NavigationIcon to="/my-reservations" />Rezerviši termin
          </Link> : canReserve && <Link className="button-link" to="/my-reservations">Moji termini</Link>}
          {hasCapability(user, 'CATALOG_READ') && <Link className="dashboard-hero-secondary" to="/catalog">Istraži katalog →</Link>}
        </div>
        {hasCapability(user, 'RESOURCE_READ') && <Link className="dashboard-hero-resource" to="/resources">Pogledaj stanice i resurse →</Link>}
      </div>
      <div className="dashboard-hero-motif" aria-hidden="true"><NavigationIcon to="/stations" /></div>
    </section>

    {canReserve && <>
      <DashboardSection title="Aktivna gaming sesija" icon="/gaming-sessions" className="dashboard-active-sessions"
        description="Preostalo vreme i stanje vaših sesija · osvežavanje na 15 sekundi">
        {visits.isLoading ? <Skeleton lines={3} label="Učitavanje aktivne sesije" /> : visits.error ?
          <ErrorState message="Sesije nisu dostupne." action={<Button onClick={() => void visits.refetch()}>Pokušaj ponovo</Button>} /> :
          active.length ? <GamingVisitList visits={active} /> : <EmptyState title="Trenutno ne igrate"
            description="Osoblje pokreće sesiju kada dođete u igraonicu."
            action={<Link to="/my-reservations">{canCreateReservation ? 'Rezervišite svoj termin' : 'Pregledajte svoje termine'}</Link>} />}
      </DashboardSection>
      <div className="dashboard-columns">
        <DashboardSection title="Sledeći potvrđeni termin" icon="/calendar" className="dashboard-next-reservation">
          {reservations.isLoading ? <Skeleton lines={3} label="Učitavanje sledećeg termina" /> : reservations.error ?
            <ErrorState message="Termini nisu dostupni." action={<Button onClick={() => void reservations.refetch()}>Pokušaj ponovo</Button>} /> :
            next ? <div className="dashboard-next-content">
              <div className="dashboard-appointment-heading"><h3>{next.serviceName ?? 'Zakazani termin'}</h3>
                <Badge tone={reservationTones[next.status]}>{reservationLabels[next.status]}</Badge></div>
              <dl className="dashboard-reservation-details">
                <div><dt>Datum</dt><dd><time dateTime={dateInBusinessZone(next.startTime)}>{formatDashboardDate(dateInBusinessZone(next.startTime))}</time></dd></div>
                <div><dt>Vreme</dt><dd><time dateTime={next.startTime}>{formatBusinessTime(next.startTime)}</time>–<time dateTime={next.endTime}>{formatBusinessTime(next.endTime)}</time></dd></div>
                {(next.resourceName || next.resourceCode) && <div><dt>Resurs</dt><dd>{next.resourceName ?? next.resourceCode}</dd></div>}
                {next.locationName && <div><dt>Lokacija</dt><dd>{next.locationName}</dd></div>}
              </dl>
              <Link className="dashboard-detail-link" to={'/my-reservations?reservationId=' + next.id}>Detalji termina →</Link>
            </div> : <EmptyState title="Nemate predstojeći potvrđeni termin" action={<Link to="/my-reservations">Termini i zakazivanje</Link>} />}
        </DashboardSection>
        <DashboardSection title="Lista čekanja" icon="/waitlist" description="Vaše prijave i ponude za slobodne termine"
          actions={<Link to="/my-reservations">Sve prijave →</Link>}>
          {queue.isLoading ? <Skeleton lines={3} label="Učitavanje liste čekanja" /> : queue.error ?
            <ErrorState message="Lista čekanja nije dostupna." action={<Button onClick={() => void queue.refetch()}>Pokušaj ponovo</Button>} /> :
            !waiting.length ? <EmptyState title="Nemate aktivne prijave" description="Kada čekate slobodan termin, prijave i ponude će biti prikazane ovde." /> :
            <ul className="dashboard-waitlist">{waiting.map((entry) => {
              const offered = entry.status === 'OFFERED'
              const expired = offered && (entry.offerStatus === 'EXPIRED'
                || !!entry.offerExpiresAt && Date.parse(entry.offerExpiresAt) <= queueNow)
              return <li key={entry.id} className={offered && !expired ? 'dashboard-waitlist--offered' : undefined}>
                <Badge tone={expired ? 'neutral' : offered ? 'success' : 'warning'}>
                  {expired ? 'Ponuda je istekla' : offered ? 'Termin je ponuđen' : 'Čeka slobodan termin'}
                </Badge>
                <strong>{entry.serviceName ?? 'Prijava na listu čekanja'}</strong>
                <time dateTime={entry.desiredStart}>{formatBusinessDateTime(entry.desiredStart)}
                  {entry.desiredEnd && ' – ' + formatBusinessTime(entry.desiredEnd)}</time>
                {(entry.resourceName || entry.locationName) && <span>{[entry.resourceName, entry.locationName].filter(Boolean).join(' · ')}</span>}
                {entry.offerExpiresAt && <small>Ponuda {expired ? 'je važila' : 'važi'} do {formatBusinessDateTime(entry.offerExpiresAt)}</small>}
                {offered && !expired && entry.offerId && <Link to={'/my-reservations?waitlistOffer=' + entry.offerId}>Pregled ponude →</Link>}
              </li>
            })}</ul>}
        </DashboardSection>
      </div>
    </>}

    {canOrder && <DashboardSection title="Poslednje narudžbine" icon="/my-orders" actions={<Link to="/my-orders">Sve narudžbine →</Link>}>
      {orders.isLoading ? <Skeleton lines={3} label="Učitavanje narudžbina" /> : orders.error ?
        <ErrorState message="Narudžbine nisu dostupne." action={<Button onClick={() => void orders.refetch()}>Pokušaj ponovo</Button>} /> :
        !orders.data?.content.length ? <EmptyState title="Još nemate narudžbine"
          action={hasCapability(user, 'CATALOG_READ') && <Link to="/catalog">Pogledajte ponudu</Link>} /> :
        <div className="dashboard-customer-orders">{orders.data.content.map((order) =>
          <DashboardOrderCard key={order.id} order={order}><Link to="/my-orders">Pregled narudžbina →</Link></DashboardOrderCard>)}</div>}
    </DashboardSection>}

    {canReserve && <details className="ui-card dashboard-history">
      <summary>Gaming istorija{visits.isSuccess && <span>{history.length} sesija u pregledu</span>}</summary>
      {visits.isLoading ? <Skeleton lines={3} label="Učitavanje gaming istorije" /> : visits.error ?
        <ErrorState message="Gaming istorija nije dostupna." action={<Button onClick={() => void visits.refetch()}>Pokušaj ponovo</Button>} /> :
        <GamingVisitList visits={history} />}
    </details>}
  </main>
}

import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { reservationApi } from '../api/reservationApi'
import { orderApi } from '../api/orderApi'
import { waitlistApi } from '../api/waitlistApi'
import { apiErrorMessage } from '../api/client'
import { Badge, Button, EmptyState, ErrorState, Skeleton, PageHeader, PageLayout } from '../components/ui'
import { reservationLabels, reservationTones } from '../components/ui/statusPresentation'
import { DashboardOrderCard, DashboardSection } from '../dashboard/DashboardComponents'
import { ActiveGamingVisit, CustomerActivityList, CustomerHomeIcon, CustomerHomeMetric, CustomerSessionDialog, CustomerWaitlistPreview, GamingMotif, UpcomingReservations } from '../dashboard/customer/CustomerHomeComponents'
import { customerActivities, homeCountdown, reservationHref, sessionHref, sessionState } from '../dashboard/customer/CustomerHomeComponents.model'
import { GamingVisitList } from '../gaming/GamingVisitList'
import { useServerNow } from '../gaming/useServerNow'
import { NavigationIcon } from '../layout/NavigationIcon'
import { formatBusinessDateTime } from '../reservations/dateTime'
import '../dashboard/dashboard.css'
import '../dashboard/customer/customerHome.css'

const bookingHref = '/my-reservations?booking=new'

export function CustomerHomePage() {
  const user = useAuthStore(state => state.user)
  const customer = user?.role === 'CUSTOMER'
  const canReserve = customer && hasCapability(user, 'RESERVATION_READ_OWN')
  const canOrder = customer && hasCapability(user, 'ORDER_READ_OWN')
  const canCreateReservation = canReserve && hasCapability(user, 'RESERVATION_CREATE')
  const canCatalog = hasCapability(user, 'CATALOG_READ'), canResources = hasCapability(user, 'RESOURCE_READ')
  const [params, setParams] = useSearchParams()
  const selectedSessionId = canReserve ? params.get('sessionId') : null
  const sessionTrigger = useRef<HTMLElement | null>(null), titleRef = useRef<HTMLHeadingElement>(null)
  const endedSessions = useRef(new Set<string>()), expiredOffers = useRef(new Set<string>())

  const visits = useQuery({
    queryKey: ['gaming-visits', 'mine', user?.id], queryFn: gamingSessionApi.mine, enabled: canReserve,
    staleTime: 5000, refetchOnMount: 'always', refetchInterval: 15000, refetchIntervalInBackground: false,
  })
  const refreshVisits = visits.refetch
  const reservations = useQuery({
    queryKey: ['reservations', 'mine', user?.id, 'home-upcoming'], enabled: canReserve,
    queryFn: () => reservationApi.mine({ page: 0, size: 3, upcoming: true, sort: 'startTime', direction: 'ASC' }),
    staleTime: 5000, refetchInterval: 30000, refetchIntervalInBackground: false,
  })
  const summary = useQuery({
    queryKey: ['reservations', 'mine-summary', user?.id], queryFn: reservationApi.mineSummary, enabled: canReserve,
    staleTime: 5000, refetchOnMount: 'always', refetchInterval: 30000, refetchIntervalInBackground: false,
  })
  const recentReservations = useQuery({
    queryKey: ['reservations', 'mine', user?.id, 'home-recent'], enabled: canReserve,
    queryFn: () => reservationApi.mine({ page: 0, size: 6, sort: 'createdAt', direction: 'DESC' }),
    staleTime: 5000, refetchInterval: 30000, refetchIntervalInBackground: false,
  })
  const orders = useQuery({
    queryKey: ['orders', 'mine', user?.id, 'home-recent'], enabled: canOrder,
    queryFn: () => orderApi.mine({ page: 0, size: 6, sort: 'createdAt', direction: 'DESC' }),
    staleTime: 5000, refetchInterval: 30000, refetchIntervalInBackground: false,
  })
  const queue = useQuery({
    queryKey: ['waitlist', 'mine', user?.id], queryFn: waitlistApi.mine, enabled: canReserve,
    staleTime: 5000, refetchOnMount: 'always', refetchInterval: 15000, refetchIntervalInBackground: false,
  })
  const refreshQueue = queue.refetch
  const clockSources = [
    { time: visits.isError ? undefined : visits.data?.[0]?.serverTime, received: visits.dataUpdatedAt },
    { time: queue.isError ? undefined : queue.data?.[0]?.serverTime, received: queue.dataUpdatedAt },
    { time: summary.isError ? undefined : summary.data?.serverTime, received: summary.dataUpdatedAt },
  ]
  const serverTime = clockSources.filter(value => value.time && Number.isFinite(Date.parse(value.time)))
    .sort((a, b) => b.received - a.received)[0]?.time
  const now = useServerNow(serverTime), synchronized = Boolean(serverTime)
  const active = useMemo(() => visits.isError ? [] : visits.data?.filter(value => value.status === 'ACTIVE') ?? [], [visits.isError, visits.data])
  const history = visits.data?.filter(value => value.status !== 'ACTIVE') ?? []
  const upcoming = reservations.data?.content ?? [], next = upcoming[0]
  const waiting = useMemo(() => queue.data?.filter(value => value.status === 'WAITING' || value.status === 'OFFERED') ?? [], [queue.data])
  const firstActive = active[0]
  const currentSession = visits.data?.find(value => value.id === selectedSessionId)
  const activeState = firstActive ? sessionState(firstActive, now, synchronized) : undefined
  const name = user?.name.trim()
  const activities = useMemo(() => customerActivities(
    visits.isError ? [] : visits.data ?? [],
    recentReservations.isError ? [] : recentReservations.data?.content ?? [],
    orders.isError ? [] : orders.data?.content ?? [],
  ), [visits.data, visits.isError, recentReservations.data, recentReservations.isError, orders.data, orders.isError])

  // Recheck once at each known deadline; polling handles any delayed backend transition.
  useEffect(() => {
    if (!synchronized || visits.isError) return
    const due = active.filter(value => Date.parse(value.endsAt) <= now && !endedSessions.current.has(`${value.id}:${value.endsAt}`))
    if (due.length) {
      due.forEach(value => endedSessions.current.add(`${value.id}:${value.endsAt}`))
      void refreshVisits()
    }
  }, [now, synchronized, active, visits.isError, refreshVisits])
  useEffect(() => {
    if (!synchronized || queue.isError) return
    const expired = waiting.filter(entry => entry.status === 'OFFERED' && entry.offerStatus !== 'EXPIRED' && entry.offerId && entry.offerExpiresAt
      && (Date.parse(entry.offerExpiresAt) <= now || Date.parse(entry.desiredStart) <= now) && !expiredOffers.current.has(entry.offerId))
    if (expired.length) {
      expired.forEach(entry => expiredOffers.current.add(entry.offerId!))
      void refreshQueue()
    }
  }, [now, synchronized, waiting, queue.isError, refreshQueue])

  function closeSession() {
    setParams(current => { const nextParams = new URLSearchParams(current); nextParams.delete('sessionId'); return nextParams }, { replace: true })
    window.requestAnimationFrame(() => { if (!sessionTrigger.current?.isConnected) titleRef.current?.focus({ preventScroll: true }) })
  }
  function refresh() {
    if (canReserve) { void refreshVisits(); void reservations.refetch(); void summary.refetch(); void recentReservations.refetch(); void refreshQueue() }
    if (canOrder) void orders.refetch()
  }
  const refreshing = canReserve && (visits.isFetching || reservations.isFetching || summary.isFetching || recentReservations.isFetching || queue.isFetching) || canOrder && orders.isFetching
  const rememberSessionTrigger = (element: HTMLElement) => { sessionTrigger.current = element }
  const activityErrors = [
    { key: 'sessions', failed: canReserve && visits.isError, message: apiErrorMessage(visits.error, 'Gaming aktivnosti nisu dostupne.'), retry: () => void refreshVisits() },
    { key: 'reservations', failed: canReserve && recentReservations.isError, message: apiErrorMessage(recentReservations.error, 'Aktivnosti rezervacija nisu dostupne.'), retry: () => void recentReservations.refetch() },
    { key: 'orders', failed: canOrder && orders.isError, message: apiErrorMessage(orders.error, 'Aktivnosti narudžbina nisu dostupne.'), retry: () => void orders.refetch() },
  ].filter(value => value.failed)
  const activityLoading = canReserve && (visits.isLoading || recentReservations.isLoading) || canOrder && orders.isLoading

  if (!customer || !canReserve && !canOrder) return <PageLayout className="g-dashboard gm-customer-home">
    <EmptyState title="Početna kupca nije dostupna" description="Lični pregled zahteva odgovarajuću dozvolu za sopstvene aktivnosti." />
  </PageLayout>

  return <PageLayout className="g-dashboard gm-customer-home">
    <PageHeader title="Početna" description={<>Lični pregled vaših aktivnosti, rezervacija i gaming sesija.</>} icon={<NavigationIcon to="/home" />} titleRef={titleRef} actions={<><Button type="button" variant="secondary" loading={refreshing} onClick={refresh}><CustomerHomeIcon kind="refresh" />Osveži pregled</Button></>} />

    <section className="dashboard-customer-hero gm-home-hero" aria-labelledby="customer-welcome">
      <div className="dashboard-hero-content">
        <span className="gm-home-hero-eyebrow">VAŠ GAMING PROSTOR</span>
        <h2 id="customer-welcome">{name ? `Dobro došli, ${name}!` : 'Dobro došli!'}</h2>
        <p className="gm-home-hero-subtitle">Spreman za novu gaming avanturu?</p>
        <p>Ovde možeš pregledati svoje sesije, rezervacije, narudžbine i sve važne informacije.</p>
        <div className="dashboard-hero-actions">
          {canCreateReservation ? <Link className="ui-button ui-button--primary ui-button--medium" to={bookingHref}><NavigationIcon to="/my-reservations" />Rezerviši termin</Link>
            : canReserve && <Link className="ui-button ui-button--primary ui-button--medium" to="/my-reservations">Moji termini</Link>}
          {canCatalog && <Link className="dashboard-hero-secondary" to="/catalog">Istraži katalog<CustomerHomeIcon kind="arrow" /></Link>}
        </div>
        {canResources && <Link className="gm-home-resource-link" to="/resources"><NavigationIcon to="/resources" />Pogledaj stanice i resurse<CustomerHomeIcon kind="arrow" /></Link>}
      </div>
      <div className="gm-home-hero-motif" aria-hidden="true"><GamingMotif /><span className="gm-home-motif-orbit" /></div>
    </section>

    <section className="ui-stat-grid gm-home-kpis" aria-label="Lični pregled aktivnosti">
      {canReserve && <>
        <CustomerHomeMetric label="Aktivna sesija" icon="/gaming-sessions" iconNode={<CustomerHomeIcon kind="gamepad" />}
          value={firstActive ? activeState?.label === 'Vreme isteklo' ? 'Vreme isteklo' : 'U toku' : 'Bez sesije'}
          detail={firstActive ? synchronized ? <span role="timer" aria-label="Preostalo vreme aktivne sesije">{homeCountdown((Date.parse(firstActive.endsAt) - now) / 1000)} preostalo</span> : 'Sinhronizacija vremena…' : 'Nema aktivne sesije'}
          loading={visits.isLoading} error={visits.isError} onRetry={() => void refreshVisits()} onOpen={firstActive ? rememberSessionTrigger : undefined}
          to={firstActive ? sessionHref(firstActive.id) : canCreateReservation ? bookingHref : '/my-reservations'} linkLabel={firstActive ? 'Detalji sesije' : canCreateReservation ? 'Rezerviši termin' : 'Moji termini'} />
        <CustomerHomeMetric label="Sledeća rezervacija" icon="/my-reservations" tone="accent"
          value={next ? <time dateTime={next.startTime}>{formatBusinessDateTime(next.startTime, false, 'sr-Latn-RS')}</time> : 'Nema termina'}
          detail={next ? <Badge tone={reservationTones[next.status]}>{reservationLabels[next.status]}</Badge> : 'Nema predstojećih rezervacija'}
          loading={reservations.isLoading} error={reservations.isError} onRetry={() => void reservations.refetch()}
          to={next ? reservationHref(next.id) : '/my-reservations?filter=UPCOMING'} linkLabel={next ? 'Detalji termina' : 'Moji termini'} />
      </>}
      {canOrder && <CustomerHomeMetric label="Moje narudžbine" icon="/my-orders" iconNode={<CustomerHomeIcon kind="cart" />} tone="success"
        value={orders.data?.totalElements ?? '—'} detail="Sve vaše narudžbine" loading={orders.isLoading} error={orders.isError}
        onRetry={() => void orders.refetch()} to="/my-orders" linkLabel="Pregled narudžbina" />}
      {canReserve && <CustomerHomeMetric label="Predstojeći termini" icon="/waitlist" iconNode={<CustomerHomeIcon kind="clock" />} tone="warning"
        value={summary.data?.nextSevenDaysReservations ?? '—'} detail="Od sada, u narednih sedam dana" loading={summary.isLoading} error={summary.isError}
        onRetry={() => void summary.refetch()} to="/my-reservations?filter=UPCOMING" linkLabel="Predstojeće rezervacije" />}
    </section>

    <div className="gm-home-main-grid">
      {canReserve && <>
        <DashboardSection title="Aktivna gaming sesija" iconNode={<CustomerHomeIcon kind="gamepad" />} className="gm-home-session-panel"
          actions={firstActive && activeState && <Badge tone={activeState.tone}>{activeState.label}</Badge>}>
          {visits.isLoading ? <Skeleton lines={6} label="Učitavanje aktivne gaming sesije" /> : visits.isError
            ? <ErrorState message={apiErrorMessage(visits.error, 'Sesije nisu dostupne.')} action={<Button variant="secondary" type="button" onClick={() => void refreshVisits()}>Pokušaj ponovo</Button>} />
            : active.length ? active.map(visit => <ActiveGamingVisit key={visit.id} visit={visit} now={now} synchronized={synchronized} onOpen={rememberSessionTrigger} />)
              : <EmptyState title="Trenutno ne igrate." description="Osoblje pokreće sesiju kada dođete u igraonicu."
                action={canCreateReservation ? <Link className="ui-button ui-button--primary ui-button--medium" to={bookingHref}>Rezerviši termin</Link> : <Link to="/my-reservations">Moji termini</Link>} />}
        </DashboardSection>
        <DashboardSection title="Sledeće rezervacije" icon="/my-reservations" className="gm-home-reservations-panel"
          actions={<Link to="/my-reservations?filter=UPCOMING">Vidi sve →</Link>}>
          {reservations.isLoading ? <Skeleton lines={6} label="Učitavanje sledećih rezervacija" /> : reservations.isError
            ? <ErrorState message={apiErrorMessage(reservations.error, 'Termini nisu dostupni.')} action={<Button variant="secondary" type="button" onClick={() => void reservations.refetch()}>Pokušaj ponovo</Button>} />
            : upcoming.length ? <UpcomingReservations reservations={upcoming} /> : <EmptyState title="Nemate predstojećih termina."
              description="Ovde se prikazuju vaši budući termini na čekanju i potvrđene rezervacije."
              action={canCreateReservation && <Link className="ui-button ui-button--primary ui-button--medium" to={bookingHref}>Nova rezervacija</Link>} />}
        </DashboardSection>
      </>}
      <DashboardSection title="Brze akcije" icon="/catalog" className="gm-home-quick-panel">
        <nav className="gm-home-quick-actions" aria-label="Brze akcije kupca">
          {canCreateReservation && <Link to={bookingHref}><NavigationIcon to="/my-reservations" /><strong>Nova rezervacija</strong><span>Rezerviši svoj termin</span><CustomerHomeIcon kind="arrow" /></Link>}
          {canReserve && <Link to="/my-reservations"><CustomerHomeIcon kind="clock" /><strong>Moji termini</strong><span>Pregled svih termina</span><CustomerHomeIcon kind="arrow" /></Link>}
          {canOrder && <Link to="/my-orders"><CustomerHomeIcon kind="cart" /><strong>Moje narudžbine</strong><span>Proizvodi i narudžbine</span><CustomerHomeIcon kind="arrow" /></Link>}
          {canCatalog && <Link to="/catalog"><CustomerHomeIcon kind="gamepad" /><strong>Katalog</strong><span>Istraži sve usluge</span><CustomerHomeIcon kind="arrow" /></Link>}
        </nav>
      </DashboardSection>
    </div>

    <div className="gm-home-lower-grid">
      {canReserve && <DashboardSection title="Lista čekanja" icon="/waitlist" className="gm-home-waitlist-panel"
        actions={<Link to="/my-reservations?section=waitlist">Sve prijave →</Link>}>
        {queue.isLoading ? <Skeleton lines={5} label="Učitavanje liste čekanja" /> : queue.isError
          ? <ErrorState message={apiErrorMessage(queue.error, 'Lista čekanja nije dostupna.')} action={<Button variant="secondary" type="button" onClick={() => void refreshQueue()}>Pokušaj ponovo</Button>} />
          : waiting.length ? <CustomerWaitlistPreview entries={waiting} now={now} synchronized={synchronized} canManage={canCreateReservation} />
            : <EmptyState title="Nemate aktivnih prijava na listi čekanja." description="Kada se prijavite za zauzet termin, prijave i ponude pojaviće se ovde."
              action={canCreateReservation && <Link to={bookingHref}>Nova rezervacija →</Link>} />}
      </DashboardSection>}
      <DashboardSection title="Poslednje aktivnosti" icon="/waitlist" description="Pregled dostupnih sesija, rezervacija i narudžbina." className="gm-home-activity-panel">
        {activityErrors.map(error => <ErrorState key={error.key} message={error.message} action={<Button variant="secondary" type="button" onClick={error.retry}>Pokušaj ponovo</Button>} />)}
        {activityLoading && <Skeleton lines={4} label="Učitavanje poslednjih aktivnosti" />}
        {activities.length > 0 && <CustomerActivityList activities={activities} icon={path => <NavigationIcon to={path} />} onOpen={rememberSessionTrigger} />}
        {activityErrors.length > 0 && activities.length > 0 && <p className="gm-home-section-note">Prikazane su aktivnosti iz dostupnih izvora.</p>}
        {!activityLoading && !activityErrors.length && !activities.length && <EmptyState title="Još nema aktivnosti" description="Ovde će se pojaviti vaše rezervacije, narudžbine i gaming sesije." />}
      </DashboardSection>
    </div>

    {canOrder && <DashboardSection title="Poslednje narudžbine" iconNode={<CustomerHomeIcon kind="cart" />} className="gm-home-orders-panel"
      actions={<Link to="/my-orders">Sve narudžbine →</Link>}>
      {orders.isLoading ? <div className="gm-home-orders-grid"><Skeleton lines={3} label="Učitavanje narudžbine" /><Skeleton lines={3} label="Učitavanje narudžbine" /></div> : orders.isError
        ? <ErrorState message={apiErrorMessage(orders.error, 'Narudžbine nisu dostupne.')} action={<Button variant="secondary" type="button" onClick={() => void orders.refetch()}>Pokušaj ponovo</Button>} />
        : !orders.data?.content.length ? <EmptyState title="Još nemate narudžbine" action={canCatalog && <Link to="/catalog">Pogledajte ponudu →</Link>} />
          : <div className="gm-home-orders-grid">{orders.data.content.slice(0, 3).map(order => <DashboardOrderCard key={order.id} order={order} locale="sr-Latn-RS">
            <Link to="/my-orders">Pregled narudžbina →</Link></DashboardOrderCard>)}</div>}
    </DashboardSection>}

    {canReserve && <details id="gaming-history" className="ui-card dashboard-history gm-home-history">
      <summary><span><CustomerHomeIcon kind="gamepad" />Gaming istorija</span>{visits.isSuccess && <small>{history.length} sesija u pregledu</small>}</summary>
      {visits.isLoading ? <Skeleton lines={4} label="Učitavanje gaming istorije" /> : visits.isError
        ? <ErrorState message={apiErrorMessage(visits.error, 'Gaming istorija nije dostupna.')} action={<Button variant="secondary" type="button" onClick={() => void refreshVisits()}>Pokušaj ponovo</Button>} />
        : <GamingVisitList visits={history} locale="sr-Latn-RS" showDuration />}
    </details>}

    <CustomerSessionDialog open={Boolean(selectedSessionId)} visit={currentSession} now={now} synchronized={synchronized} loading={visits.isLoading}
      error={visits.isError ? apiErrorMessage(visits.error, 'Detalji gaming sesije nisu dostupni.') : undefined} returnFocusRef={sessionTrigger}
      onClose={closeSession} onRefresh={() => void refreshVisits()} />
  </PageLayout>
}

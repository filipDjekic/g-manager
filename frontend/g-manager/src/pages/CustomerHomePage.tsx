import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { reservationApi } from '../api/reservationApi'
import { orderApi } from '../api/orderApi'
import { waitlistApi } from '../api/waitlistApi'
import { apiErrorMessage } from '../api/client'
import { Badge, Button, EmptyState, ErrorState, Skeleton, PageHeader, PageLayout } from '../components/ui'
import { DashboardOrderCard, DashboardSection } from '../dashboard/DashboardComponents'
import { ActiveGamingVisit, CustomerActivityList, CustomerSessionDialog, CustomerWaitlistPreview, UpcomingReservations } from '../dashboard/customer/CustomerHomeComponents'
import { customerActivities, sessionState } from '../dashboard/customer/CustomerHomeComponents.model'
import { GamingVisitList } from '../gaming/GamingVisitList'
import { useServerNow } from '../gaming/useServerNow'
import { NavigationIcon } from '../layout/NavigationIcon'
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
  const location = useLocation()
  const [historyExpanded, setHistoryExpanded] = useState(()=>['#gaming-history','#activities'].includes(location.hash))
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
    queryKey: ['reservations', 'mine', user?.id, 'home-recent'], enabled: canReserve && historyExpanded,
    queryFn: () => reservationApi.mine({ page: 0, size: 6, sort: 'createdAt', direction: 'DESC' }),
    staleTime: 5000, refetchInterval: 30000, refetchIntervalInBackground: false,
  })
  const orders = useQuery({
    queryKey: ['orders', 'mine', user?.id, 'home-recent'], enabled: canOrder && historyExpanded,
    queryFn: () => orderApi.mine({ page: 0, size: 6, sort: 'createdAt', direction: 'DESC' }),
    staleTime: 5000, refetchInterval: 30000, refetchIntervalInBackground: false,
  })
  const activeOrderQueries = useQueries({ queries: (['CREATED','IN_PROGRESS','READY'] as const).map(status=>({
    queryKey:['orders','mine',user?.id,'home-active',status], enabled:canOrder,
    queryFn:()=>orderApi.mine({page:0,size:3,status,sort:'createdAt',direction:'DESC'}), staleTime:5000,refetchInterval:30000,refetchIntervalInBackground:false,
  })) })
  const activeOrders = activeOrderQueries.flatMap(query=>query.data?.content??[]).sort((a,b)=>Number(b.status==='READY')-Number(a.status==='READY')||b.createdAt.localeCompare(a.createdAt))
  const activeOrdersLoading = activeOrderQueries.some(query=>query.isLoading), activeOrdersError=activeOrderQueries.find(query=>query.isError)?.error
  const refreshActiveOrders=()=>{ activeOrderQueries.forEach(query=>void query.refetch()); if(historyExpanded)void orders.refetch() }
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
  const upcoming = reservations.data?.content ?? []
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
    if (canReserve) { void refreshVisits(); void reservations.refetch(); void summary.refetch(); if(historyExpanded)void recentReservations.refetch(); void refreshQueue() }
    if (canOrder) refreshActiveOrders()
  }
  const refreshing = canReserve && (visits.isFetching || reservations.isFetching || summary.isFetching || recentReservations.isFetching || queue.isFetching) || canOrder && (orders.isFetching || activeOrderQueries.some(query=>query.isFetching))
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

  return <PageLayout className="g-dashboard gm-customer-home gm-home-simple">
    <PageHeader title={name ? `Zdravo, ${name}` : 'Početna'} description="Vaši termini, gaming sesije i narudžbine."
      titleRef={titleRef} actions={<><Button variant="secondary" loading={refreshing} onClick={refresh}>Osveži</Button>
        {canCreateReservation && <Link className="ui-button ui-button--primary ui-button--medium" to={bookingHref}>Rezerviši termin</Link>}</>} />
    {canReserve && (visits.isLoading || visits.isError || active.length > 0) && <DashboardSection title="Vaša gaming sesija"
      actions={activeState && <Badge tone={activeState.tone}>{activeState.label}</Badge>}>
      {visits.isLoading ? <Skeleton lines={4} /> : visits.isError ? <ErrorState message={apiErrorMessage(visits.error, 'Sesije nisu dostupne.')}
        action={<Button variant="secondary" onClick={() => void refreshVisits()}>Pokušaj ponovo</Button>} /> : active.map(visit =>
        <ActiveGamingVisit key={visit.id} visit={visit} now={now} synchronized={synchronized} onOpen={rememberSessionTrigger} />)}
      <p>Za produženje vremena obratite se osoblju. Status sesije potvrđuje server.</p>
    </DashboardSection>}
    {canReserve && (queue.isError || waiting.length > 0) && <DashboardSection title="Lista čekanja i ponude"
      actions={<Link to="/my-reservations?section=waitlist">Sve prijave →</Link>}>
      {queue.isError ? <ErrorState message="Ponude trenutno nije moguće proveriti." action={<Button variant="secondary" onClick={() => void refreshQueue()}>Pokušaj ponovo</Button>} /> :
        <CustomerWaitlistPreview entries={waiting} now={now} synchronized={synchronized} canManage={canCreateReservation} />}
    </DashboardSection>}
    <div className="ui-hub-grid">
      {canReserve && <DashboardSection title="Sledeći termini" actions={<Link to="/my-reservations?filter=UPCOMING">Moji termini →</Link>}>
        {reservations.isLoading ? <Skeleton lines={3} /> : reservations.isError ? <ErrorState message="Termini nisu dostupni." action={<Button variant="secondary" onClick={() => reservations.refetch()}>Pokušaj ponovo</Button>} />
          : upcoming.length ? <UpcomingReservations reservations={upcoming} /> : <EmptyState title="Nemate predstojeći termin"
            description="Izaberite uslugu i slobodan početak. Zahtev zatim čeka potvrdu osoblja."
            action={canCreateReservation && <Link to={bookingHref}>Rezerviši termin →</Link>} />}
      </DashboardSection>}
      {canOrder && <DashboardSection title="Moje narudžbine" actions={<Link to="/my-orders?section=history">Sve narudžbine →</Link>}>
        {activeOrdersLoading ? <Skeleton lines={3} /> : <>
          {activeOrdersError&&<ErrorState message="Deo aktivnih narudžbina nije moguće osvežiti." action={<Button variant="secondary" onClick={refreshActiveOrders}>Pokušaj ponovo</Button>}/>}
          {activeOrders.length ? activeOrders.slice(0,3).map(order=><DashboardOrderCard key={order.id} order={order}><Link to={'/my-orders?orderId='+order.id}>Prati narudžbinu →</Link></DashboardOrderCard>)
            : !activeOrdersError&&<EmptyState title="Nema aktivnih narudžbina" action={<Link to="/my-orders">Poruči proizvode →</Link>}/>}
        </>}

      </DashboardSection>}
    </div>
    <nav className="ui-view-navigation" aria-label="Istražite ponudu">{canCatalog && <Link to="/catalog">Usluge i proizvodi</Link>}
      {canResources && <Link to="/resources">Izaberi mesto na mapi</Link>}</nav>
    <details className="ui-advanced-filters" open={historyExpanded} onToggle={event => setHistoryExpanded(event.currentTarget.open)}><summary>Poslednje aktivnosti i istorija</summary>
      {historyExpanded && <><h2>Poslednje aktivnosti</h2>{activityErrors.map(error => <ErrorState key={error.key} message={error.message} action={<Button variant="secondary" onClick={error.retry}>Pokušaj ponovo</Button>} />)}
        {activityLoading && <Skeleton lines={3} />}{activities.length > 0 && <CustomerActivityList activities={activities} icon={path => <NavigationIcon to={path} />} onOpen={rememberSessionTrigger} />}
        {!activityLoading && !activityErrors.length && !activities.length && <p>Još nema aktivnosti.</p>}
        {canReserve && <><h2 id="gaming-history">Gaming istorija</h2><GamingVisitList visits={history} locale="sr-Latn-RS" showDuration /></>}
        {canOrder && <><h2>Poslednje narudžbine</h2>{orders.data?.content.map(order => <DashboardOrderCard key={order.id} order={order}><Link to={`/my-orders?orderId=${order.id}`}>Detalji →</Link></DashboardOrderCard>)}</>}
      </>}
    </details>
    <CustomerSessionDialog open={Boolean(selectedSessionId)} visit={currentSession} now={now} synchronized={synchronized} loading={visits.isLoading}
      error={visits.isError ? apiErrorMessage(visits.error, 'Detalji gaming sesije nisu dostupni.') : undefined} returnFocusRef={sessionTrigger}
      onClose={closeSession} onRefresh={() => void refreshVisits()} />
  </PageLayout>
}

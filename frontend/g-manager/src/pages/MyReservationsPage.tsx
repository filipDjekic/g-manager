import { useDirtyGuard } from '../forms/useDirtyGuard'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { reservationApi } from '../api/reservationApi'
import { waitlistApi } from '../api/waitlistApi'
import { userApi } from '../api/userApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, EmptyState, ErrorState, Input, Pagination, Select, Skeleton, PageHeader, PageLayout, StatCard, Card, Alert } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import { reservationLabels } from '../components/ui/statusPresentation'
import { useServerNow } from '../gaming/useServerNow'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import { CustomerBookingDialog, type BookingPrefill } from '../reservations/customer/CustomerBookingDialog'
import { CustomerReservationCard } from '../reservations/customer/CustomerReservationCard'
import { CustomerWaitlist } from '../reservations/customer/CustomerWaitlist'
import { CalendarClock, CustomerReservationIcon } from '../reservations/customer/customerPresentation'
import { customerReservationError, loadBookingServices } from '../reservations/customer/customerPresentation.model'
import type { Reservation, ReservationDetailAction, ReservationStatus } from '../types/reservation.types'
import type { WaitlistEntry } from '../types/waitlist.types'
import '../reservations/customer/customerReservations.css'

const validFilters = new Set(['ALL', 'UPCOMING', 'PENDING', 'COMPLETED', 'CANCELLED', 'REJECTED', 'CONFIRMED'])
function catalogSelection() { try { return sessionStorage.getItem('gmanager.catalog-selection') ?? '' } catch { return '' } }
export function MyReservationsPage() {
  const user = useAuthStore(state => state.user), client = useQueryClient(), toast = useToast()
  const canRead = user?.role === 'CUSTOMER' && hasCapability(user, 'RESERVATION_READ_OWN'), canCreate = canRead && hasCapability(user, 'RESERVATION_CREATE')
  const canChange = hasCapability(user, 'RESERVATION_CHANGE_STATUS')
  const [params, setParams] = useSearchParams()
  const [initialSelection] = useState(catalogSelection), bookingTrigger = useRef<HTMLElement | null>(null), detailTrigger = useRef<HTMLElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null), actionRef = useRef(false), expiredOffers = useRef(new Set<string>()), focusedOffer = useRef('')
  const closingBooking = useRef(false)
  const [booking, setBooking] = useState<BookingPrefill | null>(() => params.get('serviceId') || params.get('resourceId') || params.get('booking') === 'new' || initialSelection
    ? { serviceId: params.get('serviceId') ?? initialSelection, resourceId: params.get('resourceId') ?? '', locationId: params.get('locationId') ?? '', areaId: params.get('areaId') ?? '' } : null)
  const [detailAction, setDetailAction] = useState<ReservationDetailAction | undefined>(), [waitlistPending, setWaitlistPending] = useState(''), [actionError, setActionError] = useState('')
  const releaseNavigation = useDirtyGuard(!!waitlistPending, { pending: !!waitlistPending })
  const rawFilter = params.get('filter') ?? params.get('status') ?? 'UPCOMING', filter = validFilters.has(rawFilter) ? rawFilter : 'ALL'
  const listDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : ''
  const rawPage = Number(params.get('page') ?? '1'), page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage - 1 : 0
  const size = [10, 20, 50, 100].includes(Number(params.get('size'))) ? Number(params.get('size')) : 10
  const direction = params.get('sort') === 'latest' ? 'DESC' : 'ASC'
  const section = params.get('section') === 'waitlist' || params.has('waitlistOffer') && params.get('section') !== 'reservations' ? 'waitlist' : 'reservations'
  const linkedOffer = params.get('waitlistOffer'), selectedId = params.get('reservationId')
  const list = useQuery({ queryKey: ['reservations', 'mine', user?.id, filter, listDate, page, size, direction],
    queryFn: () => reservationApi.mine({ page, size, status: filter === 'ALL' || filter === 'UPCOMING' ? undefined : filter as ReservationStatus,
      upcoming: filter === 'UPCOMING' || undefined, from: listDate || undefined, to: listDate || undefined, sort: 'startTime', direction }),
    enabled: canRead, refetchInterval: 15000, refetchIntervalInBackground: false })
  const summary = useQuery({ queryKey: ['reservations', 'mine-summary', user?.id], queryFn: reservationApi.mineSummary, enabled: canRead, refetchInterval: 15000, refetchIntervalInBackground: false })
  const services = useQuery({ queryKey: ['catalog', 'customer-booking-services'], queryFn: loadBookingServices, enabled: canRead && hasCapability(user, 'CATALOG_READ'), staleTime: 60000 })
  const employees = useQuery({ queryKey: ['users', 'customer-booking-employees', user?.id], queryFn: userApi.employees, enabled: canCreate && Boolean(booking), staleTime: 60000 })
  const waitlistQuery = useQuery({ queryKey: ['waitlist', 'mine', user?.id], queryFn: waitlistApi.mine, enabled: canRead, refetchInterval: 15000, refetchIntervalInBackground: false })
  const waitlist = useMemo(() => waitlistQuery.data ?? [], [waitlistQuery.data]), serverTime = waitlist[0]?.serverTime ?? summary.data?.serverTime, now = useServerNow(serverTime)
  const activeOffers = waitlist.filter(entry => entry.status === 'OFFERED' && entry.offerStatus !== 'EXPIRED' && entry.offerExpiresAt && serverTime
    && Date.parse(entry.offerExpiresAt) > now && Date.parse(entry.desiredStart) > now).length
  const changeParams = (changes: Record<string, string | undefined>, replace = false) => setParams(current => {
    const next = new URLSearchParams(current)
    Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key) })
    return next
  }, { replace })
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['reservations'] }), client.invalidateQueries({ queryKey: ['waitlist', 'mine'] })]) }
  const clearBookingParams = () => changeParams({ booking: undefined, serviceId: undefined, resourceId: undefined, locationId: undefined, areaId: undefined }, true)
  const closeBooking = () => { closingBooking.current = true; setBooking(null); clearBookingParams(); if (!bookingTrigger.current?.isConnected) window.requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true })) }
  function openBooking(prefill: BookingPrefill = {}, trigger?: HTMLElement) {
    if (!canCreate) return
    closingBooking.current = false
    bookingTrigger.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : titleRef.current)
    setBooking(prefill); setActionError('')
    changeParams({ booking: 'new', serviceId: prefill.serviceId, resourceId: prefill.resourceId, locationId: prefill.locationId, areaId: prefill.areaId }, true)
  }
  useEffect(() => {
    const serviceId = params.get('serviceId'), resourceId = params.get('resourceId')
    const requested = serviceId || resourceId || params.get('booking') === 'new'
    // Router navigation can commit after local state. Do not reopen a completed/closed form from the previous URL.
    if (!requested) closingBooking.current = false
    if (canCreate && !booking && !closingBooking.current && requested) setBooking({ serviceId: serviceId ?? '', resourceId: resourceId ?? '', locationId: params.get('locationId') ?? '', areaId: params.get('areaId') ?? '' })
  }, [params, booking, canCreate])
  useEffect(() => {
    if (!booking?.serviceId) return
    try { if (sessionStorage.getItem('gmanager.catalog-selection') === booking.serviceId) sessionStorage.removeItem('gmanager.catalog-selection') } catch { /* storage is optional */ }
  }, [booking?.serviceId])
  useEffect(() => {
    if (!serverTime) return
    const expired = waitlist.filter(entry => entry.status === 'OFFERED' && entry.offerStatus !== 'EXPIRED' && entry.offerId && entry.offerExpiresAt && Date.parse(entry.offerExpiresAt) <= now && !expiredOffers.current.has(entry.offerId))
    if (expired.length) { expired.forEach(entry => expiredOffers.current.add(entry.offerId!)); void waitlistQuery.refetch() }
  }, [now, serverTime, waitlist, waitlistQuery])
  useEffect(() => {
    if (!linkedOffer || section !== 'waitlist' || booking && canCreate || selectedId || focusedOffer.current === linkedOffer) return
    const offer = document.getElementById(`offer-${linkedOffer}`)
    if (offer) { offer.scrollIntoView({ block: 'center' }); offer.focus({ preventScroll: true }); focusedOffer.current = linkedOffer }
  }, [linkedOffer, section, waitlist, booking, canCreate, selectedId])
  useEffect(() => {
    if (!list.data || list.isError || page < Math.max(1, list.data.totalPages)) return
    setParams(current => { const next = new URLSearchParams(current); next.set('page', String(Math.max(1, list.data!.totalPages))); return next }, { replace: true })
  }, [list.data, list.isError, page, setParams])
  function openDetails(value: Reservation, action?: ReservationDetailAction, trigger?: HTMLElement) {
    detailTrigger.current = trigger ?? titleRef.current; setDetailAction(action); changeParams({ reservationId: value.id })
  }
  const closeDetails = () => { if (!detailTrigger.current?.isConnected) window.requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true })); changeParams({ reservationId: undefined }, true); setDetailAction(undefined) }
  async function acceptOffer(entry: WaitlistEntry) {
    if (!entry.offerId || !serverTime || !entry.offerExpiresAt || Date.parse(entry.offerExpiresAt) <= now || Date.parse(entry.desiredStart) <= now || actionRef.current || waitlistQuery.isError) return
    actionRef.current = true; setWaitlistPending(entry.id); setActionError('')
    try {
      const accepted = await waitlistApi.accept(entry.offerId)
      if (accepted.status !== 'ACCEPTED' || !accepted.reservationId) throw new Error('Rezervacija nije potvrđena.')
      detailTrigger.current = titleRef.current
      releaseNavigation(); setDetailAction(undefined); changeParams({ reservationId: accepted.reservationId, filter: undefined, status: undefined, page: undefined, date: undefined, section: 'reservations', waitlistOffer: undefined })
      toast('Ponuda je prihvaćena i rezervacija je kreirana.', 'success'); await refresh()
    } catch (cause) { setActionError(customerReservationError(cause, 'Ponuda je istekla ili je termin zauzet. Rezervacija nije potvrđena.')); await waitlistQuery.refetch() }
    finally { actionRef.current = false; setWaitlistPending('') }
  }
  async function cancelWaitlist(entry: WaitlistEntry) {
    if (actionRef.current) return
    actionRef.current = true; setWaitlistPending(entry.id); setActionError('')
    try { await waitlistApi.cancel(entry); toast('Prijava na listu čekanja je otkazana.', 'success'); await waitlistQuery.refetch() }
    catch (cause) { setActionError(customerReservationError(cause, 'Prijavu nije moguće otkazati.')); await waitlistQuery.refetch() }
    finally { actionRef.current = false; setWaitlistPending('') }
  }
  if (!canRead) return <PageLayout className="gm-my-reservations"><EmptyState title="Moji termini nisu dostupni" description="Ovaj pregled je dostupan klijentima sa dozvolom za sopstvene rezervacije." /></PageLayout>
  const emptyFiltered = filter !== 'ALL' || Boolean(listDate), reservations = list.data?.content ?? []
  return <PageLayout className="gm-my-reservations">
    <PageHeader icon={<CalendarClock />}  title="Moji termini" description={<>Vaši termini, novi zahtevi i dozvoljeno otkazivanje.</>} titleRef={titleRef} actions={<>{canCreate && <Button type="button" className="gm-my-new-reservation" onClick={event => openBooking({}, event.currentTarget)}>+ Nova rezervacija</Button>}</>} />
    <details className="ui-advanced-filters"><summary>Pregled mojih termina</summary>
    <section className="ui-stat-grid gm-my-reservation-kpis" aria-label="Statistika mojih termina" aria-busy={summary.isLoading}>
      <StatCard icon={<CalendarClock />} label="Predstojeći" value={summary.data ? summary.data.upcomingReservations : '—'} description="Budući termini na čekanju ili potvrđeni" />
      <StatCard label={<>Danas</>} value={<>{summary.data ? summary.data.todayReservations : '—'}</>} icon={<CustomerReservationIcon kind="clock" />} description={<>Današnji termini na čekanju ili potvrđeni</>} />
      <StatCard label={<>Završeni</>} value={<>{summary.data ? summary.data.completedReservations : '—'}</>} icon={<CustomerReservationIcon kind="check" />} description={<>Sve završene rezervacije</>} />
    </section>
    {summary.isError && <ErrorState message={customerReservationError(summary.error, 'Statistiku termina nije moguće osvežiti.')} action={<Button variant="secondary" type="button" onClick={() => summary.refetch()}>Pokušaj ponovo</Button>} />}
    {summary.isError && summary.data && <p className="gm-my-booking-note" role="status">Statistika prikazuje poslednje uspešno učitane podatke.</p>}
    </details>
    <div className="gm-my-section-tabs" role="group" aria-label="Pregledi mojih termina"><Button variant="ghost" type="button" aria-pressed={section === 'reservations'} onClick={() => changeParams({ section: 'reservations' })}>Moji termini</Button>
      <Button variant="ghost" type="button" aria-pressed={section === 'waitlist'} onClick={() => changeParams({ section: 'waitlist' })}>Lista čekanja{activeOffers > 0 && <Badge tone="success">{activeOffers} {activeOffers === 1 ? 'ponuda' : 'ponude'}</Badge>}</Button></div>
    {activeOffers > 0 && section === 'reservations' && <div className="gm-my-offer-notice" role="status"><span>Imate {activeOffers} {activeOffers === 1 ? 'ponudu' : 'ponude'} oslobođenih termina. Proverite rok za prihvatanje.</span><Button type="button" variant="secondary" onClick={() => changeParams({ section: 'waitlist' })}>Pogledaj ponude</Button></div>}
    {actionError && <Alert tone="danger" role="alert">{actionError}</Alert>}
    {section === 'reservations' ? <section className="gm-my-reservations-content" aria-label="Moje rezervacije">
      <div className="ui-list-toolbar-main"><label>Prikaz termina<Select value={filter} onChange={event => changeParams({ filter: event.target.value, status: undefined, page: undefined })}>
        <option value="UPCOMING">Predstojeći</option><option value="ALL">Svi termini i istorija</option>{Object.entries(reservationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <details className="ui-advanced-filters"><summary>Datum i redosled</summary><label>Datum<Input type="date" value={listDate} onChange={event => changeParams({ date: event.target.value, page: undefined })} /></label>
          {listDate && <Button variant="ghost" onClick={() => changeParams({ date: undefined, page: undefined })}>Poništi datum</Button>}
          <label>Redosled<Select value={direction} onChange={event => changeParams({ sort: event.target.value === 'DESC' ? 'latest' : undefined, page: undefined })}><option value="ASC">Najraniji prvo</option><option value="DESC">Najnoviji prvo</option></Select></label></details></div>
      <div className="gm-my-list-caption"><span>{list.data ? `${list.data.totalElements} rezervacija` : 'Učitavanje rezervacija…'}</span><Button type="button" variant="secondary" loading={list.isFetching} onClick={() => void refresh()}><CustomerReservationIcon kind="refresh" />Osveži</Button></div>
      {list.isError && <ErrorState message={customerReservationError(list.error, 'Rezervacije nije moguće učitati.')} action={<Button variant="secondary" type="button" onClick={() => list.refetch()}>Pokušaj ponovo</Button>} />}
      {list.isLoading ? <div className="gm-my-reservation-grid">{[0, 1, 2].map(index => <Card as="div" padding="none" className="gm-my-reservation-card" key={index}>
        <div className="gm-my-reservation-card-main"><div className="gm-my-reservation-image gm-my-loading-image"><Skeleton lines={1} label="Učitavanje slike usluge" /></div><Skeleton lines={6} label="Učitavanje rezervacije" /></div>
        <Skeleton lines={1} label="Učitavanje akcija rezervacije" /></Card>)}</div>
        : !list.isError && !reservations.length ? <div className="gm-my-empty"><CalendarClock /><EmptyState title={emptyFiltered ? 'Nema rezervacija za izabrane filtere' : 'Nema rezervacija'} description={emptyFiltered ? 'Promenite status ili datum da biste proširili pregled.' : 'Izaberite uslugu i rezervišite svoj prvi termin.'}
          action={emptyFiltered ? <Button type="button" variant="secondary" onClick={() => changeParams({ filter: undefined, status: undefined, date: undefined, page: undefined })}>Resetuj filtere</Button> : canCreate ? <Button type="button" onClick={event => openBooking({}, event.currentTarget)}>+ Nova rezervacija</Button> : undefined} /></div>
          : <div className="gm-my-reservation-grid">{reservations.map(value => <CustomerReservationCard key={value.id} value={value} service={services.data?.find(item => item.id === value.serviceId)} disabled={list.isError || Boolean(waitlistPending)} canCreate={canCreate} canChange={canChange}
            onDetails={openDetails} onRebook={(reservation, trigger) => openBooking({ serviceId: reservation.serviceId, resourceId: reservation.resourceId ?? undefined, locationId: reservation.locationId ?? undefined,
              employeeId: reservation.employeeId }, trigger)} />)}</div>}
      {list.data && <Pagination page={page} totalPages={list.data.totalPages} totalElements={list.data.totalElements} pageSize={size} onPageSizeChange={size => changeParams({ size: String(size), page: undefined })} numbered loading={list.isFetching} onPageChange={next => changeParams({ page: next ? String(next + 1) : undefined })} />}
    </section> : <CustomerWaitlist entries={waitlist} now={now} synchronized={Boolean(serverTime)} loading={waitlistQuery.isLoading} fetching={waitlistQuery.isFetching} error={waitlistQuery.error}
      pending={waitlistPending} linkedOffer={linkedOffer} onRefresh={() => void waitlistQuery.refetch()} onAccept={value => void acceptOffer(value)} onCancel={value => void cancelWaitlist(value)} onBook={canCreate ? () => openBooking() : undefined} />}
    <ReservationDetailsDrawer reservationId={booking && canCreate ? null : selectedId} onChanged={refresh} initialAction={detailAction} appearance="customer" returnFocusRef={detailTrigger} onClose={closeDetails} />
    {booking && canCreate && <CustomerBookingDialog prefill={booking} services={services.data ?? []} employees={employees.data ?? []} loading={services.isLoading || employees.isLoading} dataError={services.error ?? employees.error}
      returnFocusRef={bookingTrigger} onReload={() => { void services.refetch(); void employees.refetch() }} onScopeChanged={value => changeParams({ serviceId: value.serviceId, resourceId: value.resourceId, locationId: value.locationId, areaId: value.areaId }, true)} onClose={closeBooking}
      onCreated={async id => { if (id) closingBooking.current = true; changeParams({ filter: undefined, status: undefined, page: undefined, date: undefined, section: 'reservations', ...(id ? { reservationId: id, booking: undefined, serviceId: undefined, resourceId: undefined, locationId: undefined, areaId: undefined } : {}) }, true);
        if (id) { setBooking(null); setDetailAction(undefined); detailTrigger.current = titleRef.current }
        await refresh() }} onWaitlisted={async () => { closingBooking.current = true; setBooking(null); changeParams({ section: 'waitlist', booking: undefined, serviceId: undefined, resourceId: undefined, locationId: undefined, areaId: undefined }, true);
          window.requestAnimationFrame(() => { if (!bookingTrigger.current?.isConnected) titleRef.current?.focus({ preventScroll: true }) }); await waitlistQuery.refetch() }} />}
  </PageLayout>
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { reservationApi } from '../api/reservationApi'
import { waitlistApi } from '../api/waitlistApi'
import { userApi } from '../api/userApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, EmptyState, ErrorState, Input, Pagination, Select, Skeleton } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import { reservationLabels } from '../components/ui/statusPresentation'
import { useServerNow } from '../gaming/useServerNow'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import { CustomerBookingDialog, type BookingPrefill } from '../reservations/customer/CustomerBookingDialog'
import { CustomerReservationCard } from '../reservations/customer/CustomerReservationCard'
import { CustomerWaitlist } from '../reservations/customer/CustomerWaitlist'
import { CalendarClock, CustomerReservationIcon, customerReservationError, loadBookingServices } from '../reservations/customer/customerPresentation'
import type { Reservation, ReservationDetailAction, ReservationStatus } from '../types/reservation.types'
import type { WaitlistEntry } from '../types/waitlist.types'
import '../reservations/customer/customerReservations.css'

const statusTabs = [['ALL', 'Svi'], ['UPCOMING', 'Predstojeći'], ['PENDING', 'Na čekanju'], ['COMPLETED', 'Završeni'], ['CANCELLED', 'Otkazani']] as const
const validFilters = new Set(['ALL', 'UPCOMING', 'PENDING', 'COMPLETED', 'CANCELLED', 'REJECTED', 'CONFIRMED'])
function catalogSelection() { try { return sessionStorage.getItem('gmanager.catalog-selection') ?? '' } catch { return '' } }
export function MyReservationsPage() {
  const user = useAuthStore(state => state.user), client = useQueryClient(), toast = useToast()
  const canRead = user?.role === 'CUSTOMER' && hasCapability(user, 'RESERVATION_READ_OWN'), canCreate = canRead && hasCapability(user, 'RESERVATION_CREATE')
  const canChange = hasCapability(user, 'RESERVATION_CHANGE_STATUS')
  const [params, setParams] = useSearchParams()
  const initialSelection = useRef(catalogSelection()), bookingTrigger = useRef<HTMLElement | null>(null), detailTrigger = useRef<HTMLElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null), actionRef = useRef(false), expiredOffers = useRef(new Set<string>()), focusedOffer = useRef('')
  const [booking, setBooking] = useState<BookingPrefill | null>(() => params.get('serviceId') || params.get('resourceId') || params.get('booking') === 'new' || initialSelection.current
    ? { serviceId: params.get('serviceId') ?? initialSelection.current, resourceId: params.get('resourceId') ?? '', locationId: params.get('locationId') ?? '', areaId: params.get('areaId') ?? '' } : null)
  const [detailAction, setDetailAction] = useState<ReservationDetailAction | undefined>(), [waitlistPending, setWaitlistPending] = useState(''), [actionError, setActionError] = useState('')
  const rawFilter = params.get('filter') ?? params.get('status') ?? 'ALL', filter = validFilters.has(rawFilter) ? rawFilter : 'ALL'
  const listDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : ''
  const rawPage = Number(params.get('page') ?? '1'), page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage - 1 : 0
  const direction = params.get('sort') === 'latest' ? 'DESC' : 'ASC'
  const section = params.get('section') === 'waitlist' || params.has('waitlistOffer') && params.get('section') !== 'reservations' ? 'waitlist' : 'reservations'
  const linkedOffer = params.get('waitlistOffer'), selectedId = params.get('reservationId')
  const list = useQuery({ queryKey: ['reservations', 'mine', user?.id, filter, listDate, page, direction],
    queryFn: () => reservationApi.mine({ page, size: 12, status: filter === 'ALL' || filter === 'UPCOMING' ? undefined : filter as ReservationStatus,
      upcoming: filter === 'UPCOMING' || undefined, from: listDate || undefined, to: listDate || undefined, sort: 'startTime', direction }),
    enabled: canRead, refetchInterval: 15000, refetchIntervalInBackground: false })
  const summary = useQuery({ queryKey: ['reservations', 'mine-summary', user?.id], queryFn: reservationApi.mineSummary, enabled: canRead, refetchInterval: 15000, refetchIntervalInBackground: false })
  const services = useQuery({ queryKey: ['catalog', 'customer-booking-services'], queryFn: loadBookingServices, enabled: canRead && hasCapability(user, 'CATALOG_READ'), staleTime: 60000 })
  const employees = useQuery({ queryKey: ['users', 'customer-booking-employees', user?.id], queryFn: userApi.employees, enabled: canCreate && Boolean(booking), staleTime: 60000 })
  const waitlistQuery = useQuery({ queryKey: ['waitlist', 'mine', user?.id], queryFn: waitlistApi.mine, enabled: canRead, refetchInterval: 15000, refetchIntervalInBackground: false })
  const waitlist = waitlistQuery.data ?? [], serverTime = waitlist[0]?.serverTime ?? summary.data?.serverTime, now = useServerNow(serverTime)
  const activeOffers = waitlist.filter(entry => entry.status === 'OFFERED' && entry.offerStatus !== 'EXPIRED' && entry.offerExpiresAt && serverTime
    && Date.parse(entry.offerExpiresAt) > now && Date.parse(entry.desiredStart) > now).length
  const changeParams = (changes: Record<string, string | undefined>, replace = false) => setParams(current => {
    const next = new URLSearchParams(current)
    Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key) })
    return next
  }, { replace })
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['reservations'] }), client.invalidateQueries({ queryKey: ['waitlist', 'mine'] })]) }
  const clearBookingParams = () => changeParams({ booking: undefined, serviceId: undefined, resourceId: undefined, locationId: undefined, areaId: undefined }, true)
  const closeBooking = () => { setBooking(null); clearBookingParams(); if (!bookingTrigger.current?.isConnected) window.requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true })) }
  function openBooking(prefill: BookingPrefill = {}, trigger?: HTMLElement) {
    if (!canCreate) return
    bookingTrigger.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : titleRef.current)
    setBooking(prefill); setActionError('')
    changeParams({ booking: 'new', serviceId: prefill.serviceId, resourceId: prefill.resourceId, locationId: prefill.locationId, areaId: prefill.areaId }, true)
  }
  useEffect(() => {
    const serviceId = params.get('serviceId'), resourceId = params.get('resourceId')
    if (canCreate && !booking && (serviceId || resourceId || params.get('booking') === 'new')) setBooking({ serviceId: serviceId ?? '', resourceId: resourceId ?? '', locationId: params.get('locationId') ?? '', areaId: params.get('areaId') ?? '' })
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
      setDetailAction(undefined); changeParams({ reservationId: accepted.reservationId, filter: undefined, status: undefined, page: undefined, date: undefined, section: 'reservations', waitlistOffer: undefined })
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
  if (!canRead) return <main className="workspace gm-my-reservations"><EmptyState title="Moji termini nisu dostupni" description="Ovaj pregled je dostupan klijentima sa dozvolom za sopstvene rezervacije." /></main>
  const emptyFiltered = filter !== 'ALL' || Boolean(listDate), reservations = list.data?.content ?? []
  return <main className="workspace gm-my-reservations">
    <header className="gm-my-reservations-heading"><div><span className="gm-my-calendar-icon"><CalendarClock /></span><div><h1 ref={titleRef} tabIndex={-1}>Moji termini</h1><p>Pregled, izmena i otkazivanje rezervacija.</p></div></div>
      {canCreate && <Button type="button" className="gm-my-new-reservation" onClick={event => openBooking({}, event.currentTarget)}>+ Nova rezervacija</Button>}</header>
    <section className="gm-my-reservation-kpis" aria-label="Statistika mojih termina" aria-busy={summary.isLoading}>
      <div><CalendarClock /><span>Predstojeći</span><strong>{summary.data ? summary.data.upcomingReservations : '—'}</strong><small>Budući termini na čekanju ili potvrđeni</small></div>
      <div className="gm-my-kpi-today"><CustomerReservationIcon kind="clock" /><span>Danas</span><strong>{summary.data ? summary.data.todayReservations : '—'}</strong><small>Današnji termini na čekanju ili potvrđeni</small></div>
      <div className="gm-my-kpi-completed"><CustomerReservationIcon kind="check" /><span>Završeni</span><strong>{summary.data ? summary.data.completedReservations : '—'}</strong><small>Sve završene rezervacije</small></div>
    </section>
    {summary.isError && <ErrorState message={customerReservationError(summary.error, 'Statistiku termina nije moguće osvežiti.')} action={<Button type="button" onClick={() => summary.refetch()}>Pokušaj ponovo</Button>} />}
    {summary.isError && summary.data && <p className="gm-my-booking-note" role="status">Statistika prikazuje poslednje uspešno učitane podatke.</p>}
    <div className="gm-my-section-tabs" role="group" aria-label="Pregledi mojih termina"><button type="button" aria-pressed={section === 'reservations'} onClick={() => changeParams({ section: 'reservations' })}>Moji termini</button>
      <button type="button" aria-pressed={section === 'waitlist'} onClick={() => changeParams({ section: 'waitlist' })}>Lista čekanja{activeOffers > 0 && <Badge tone="success">{activeOffers} {activeOffers === 1 ? 'ponuda' : 'ponude'}</Badge>}</button></div>
    {activeOffers > 0 && section === 'reservations' && <div className="gm-my-offer-notice" role="status"><span>Imate {activeOffers} {activeOffers === 1 ? 'ponudu' : 'ponude'} oslobođenih termina. Proverite rok za prihvatanje.</span><Button type="button" variant="secondary" onClick={() => changeParams({ section: 'waitlist' })}>Pogledaj ponude</Button></div>}
    {actionError && <p className="error-banner" role="alert">{actionError}</p>}
    {section === 'reservations' ? <section className="gm-my-reservations-content" aria-label="Moje rezervacije">
      <div className="gm-my-reservation-filters"><div className="gm-my-status-tabs" role="group" aria-label="Status rezervacija">{statusTabs.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => changeParams({ filter: value === 'ALL' ? undefined : value, status: undefined, page: undefined })}>{label}</button>)}</div>
        <div className="gm-my-filter-controls"><label>Izaberi datum<Input type="date" value={listDate} onChange={event => changeParams({ date: event.target.value, page: undefined })} /></label>
          {listDate && <Button type="button" variant="secondary" onClick={() => changeParams({ date: undefined, page: undefined })}>Resetuj datum</Button>}
          <label>Dodatni status<Select value={filter === 'REJECTED' || filter === 'CONFIRMED' ? filter : ''} onChange={event => changeParams({ filter: event.target.value || undefined, status: undefined, page: undefined })}><option value="">Svi / izabrani tab</option><option value="CONFIRMED">{reservationLabels.CONFIRMED}</option><option value="REJECTED">{reservationLabels.REJECTED}</option></Select></label>
          <label>Sortiranje<Select value={direction === 'DESC' ? 'latest' : 'nearest'} onChange={event => changeParams({ sort: event.target.value === 'latest' ? 'latest' : undefined, page: undefined })}><option value="nearest">Najraniji termini</option><option value="latest">Najnoviji termini</option></Select></label>
        </div></div>
      <div className="gm-my-list-caption"><span>{list.data ? `${list.data.totalElements} rezervacija` : 'Učitavanje rezervacija…'}</span><Button type="button" variant="secondary" loading={list.isFetching} onClick={() => void refresh()}><CustomerReservationIcon kind="refresh" />Osveži</Button></div>
      {list.isError && <ErrorState message={customerReservationError(list.error, 'Rezervacije nije moguće učitati.')} action={<Button type="button" onClick={() => list.refetch()}>Pokušaj ponovo</Button>} />}
      {list.isLoading ? <div className="gm-my-reservation-grid">{[0, 1, 2].map(index => <div className="gm-my-reservation-card" key={index}>
        <div className="gm-my-reservation-card-main"><div className="gm-my-reservation-image gm-my-loading-image"><Skeleton lines={1} label="Učitavanje slike usluge" /></div><Skeleton lines={6} label="Učitavanje rezervacije" /></div>
        <Skeleton lines={1} label="Učitavanje akcija rezervacije" /></div>)}</div>
        : !list.isError && !reservations.length ? <div className="gm-my-empty"><CalendarClock /><EmptyState title={emptyFiltered ? 'Nema rezervacija za izabrane filtere' : 'Nema rezervacija'} description={emptyFiltered ? 'Promenite status ili datum da biste proširili pregled.' : 'Izaberite uslugu i rezervišite svoj prvi termin.'}
          action={emptyFiltered ? <Button type="button" variant="secondary" onClick={() => changeParams({ filter: undefined, status: undefined, date: undefined, page: undefined })}>Resetuj filtere</Button> : canCreate ? <Button type="button" onClick={event => openBooking({}, event.currentTarget)}>+ Nova rezervacija</Button> : undefined} /></div>
          : <div className="gm-my-reservation-grid">{reservations.map(value => <CustomerReservationCard key={value.id} value={value} service={services.data?.find(item => item.id === value.serviceId)} disabled={list.isError || Boolean(waitlistPending)} canCreate={canCreate} canChange={canChange}
            onDetails={openDetails} onRebook={(reservation, trigger) => openBooking({ serviceId: reservation.serviceId, resourceId: reservation.resourceId ?? undefined, locationId: reservation.locationId ?? undefined,
              employeeId: reservation.employeeId }, trigger)} />)}</div>}
      {list.data && <Pagination page={page} totalPages={list.data.totalPages} totalElements={list.data.totalElements} pageSize={12} numbered loading={list.isFetching} onPageChange={next => changeParams({ page: next ? String(next + 1) : undefined })} />}
    </section> : <CustomerWaitlist entries={waitlist} now={now} synchronized={Boolean(serverTime)} loading={waitlistQuery.isLoading} fetching={waitlistQuery.isFetching} error={waitlistQuery.error}
      pending={waitlistPending} linkedOffer={linkedOffer} onRefresh={() => void waitlistQuery.refetch()} onAccept={value => void acceptOffer(value)} onCancel={value => void cancelWaitlist(value)} onBook={canCreate ? () => openBooking() : undefined} />}
    <ReservationDetailsDrawer reservationId={booking && canCreate ? null : selectedId} onChanged={refresh} initialAction={detailAction} appearance="customer" returnFocusRef={detailTrigger} onClose={closeDetails} />
    {booking && canCreate && <CustomerBookingDialog prefill={booking} services={services.data ?? []} employees={employees.data ?? []} loading={services.isLoading || employees.isLoading} dataError={services.error ?? employees.error}
      returnFocusRef={bookingTrigger} onReload={() => { void services.refetch(); void employees.refetch() }} onScopeChanged={value => changeParams({ serviceId: value.serviceId, resourceId: value.resourceId, locationId: value.locationId, areaId: value.areaId }, true)} onClose={closeBooking}
      onCreated={async id => { changeParams({ filter: undefined, status: undefined, page: undefined, date: undefined, section: 'reservations', ...(id ? { reservationId: id, booking: undefined, serviceId: undefined, resourceId: undefined, locationId: undefined, areaId: undefined } : {}) }, true);
        if (id) { setBooking(null); setDetailAction(undefined); detailTrigger.current = titleRef.current }
        await refresh() }} onWaitlisted={async () => { setBooking(null); changeParams({ section: 'waitlist', booking: undefined, serviceId: undefined, resourceId: undefined, locationId: undefined, areaId: undefined }, true);
          window.requestAnimationFrame(() => { if (!bookingTrigger.current?.isConnected) titleRef.current?.focus({ preventScroll: true }) }); await waitlistQuery.refetch() }} />}
  </main>
}

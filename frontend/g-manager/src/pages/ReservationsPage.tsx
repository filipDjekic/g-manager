import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { resourceApi } from '../api/resourceApi'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { CustomerPicker } from '../reservations/CustomerPicker'
import { StaffReservationForm } from '../reservations/StaffReservationForm'
import { ReservationScopeSwitch } from '../reservations/ReservationScopeSwitch'
import { apiErrorMessage } from '../api/client'
import { reservationApi, type ReservationFilters } from '../api/reservationApi'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { Pagination, Badge, Button, EmptyState, ErrorState, Skeleton, TableShell } from '../components/ui'
import { reservationLabels, reservationTones } from '../components/ui/statusPresentation'
import { ActionDialog } from '../components/ui/ActionDialog'
import { useListUrlState } from '../lists/useListUrlState'
import { queryKeys } from '../query/queryKeys'
import { businessInstantToLocal, formatBusinessDateTime as formatDateTime, formatBusinessTime } from '../reservations/dateTime'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import { ReservationIcon } from '../reservations/ReservationIcon'
import { ReservationRowActions } from '../reservations/ReservationRowActions'
import type { Reservation, ReservationDetailAction, ReservationScope, ReservationStatus } from '../types/reservation.types'
import '../reservations/reservations.css'

const baseDefaults = { create: '', scope: 'ALL', resourceId: '', locationId: '', customerId: '', page: '0', size: '10',
  status: '', employeeId: '', from: '', to: '', sort: 'startTime', direction: 'ASC', reservationId: '', search: '' }
const allowed = Object.keys(baseDefaults) as (keyof typeof baseDefaults)[]
const statuses: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED']
const formatBusinessDateTime = (value: string) => formatDateTime(value, false, 'sr-Latn-RS')

function calendarDate(value: string) {
  return new Intl.DateTimeFormat('sr-Latn-RS', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`))
}

export function ReservationsPage() {
  const actor = useAuthStore(state => state.user)
  const defaults = useMemo(() => ({ ...baseDefaults, scope: actor?.role === 'EMPLOYEE' ? 'MANAGEABLE' : 'ALL' }), [actor?.role])
  const url = useListUrlState(defaults, allowed)
  const scope: ReservationScope = url.state.scope === 'MANAGEABLE' ? 'MANAGEABLE' : 'ALL'
  const [createOpen, setCreateOpen] = useState(false)
  const [moreFilters, setMoreFilters] = useState(() => Boolean(url.state.employeeId || url.state.customerId || url.state.sort !== 'startTime' || url.state.direction !== 'ASC'))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSummary, setBulkSummary] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [detailAction, setDetailAction] = useState<{ id: string; action?: ReservationDetailAction } | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const selectAll = useRef<HTMLInputElement>(null)
  const employees = useQuery({ queryKey: ['users', 'reservation-employees'], queryFn: userApi.employees })
  const resources = useQuery({ queryKey: ['resources', 'reservation-filters', actor?.id], queryFn: resourceApi.reservationResources, refetchInterval: 15000 })
  const locations = useQuery({ queryKey: ['resources', 'locations'], queryFn: resourceApi.locations })
  const managementScope = useQuery({ queryKey: ['resource-management-scope'], queryFn: resourceApi.managementScope,
    enabled: actor?.role === 'EMPLOYEE', refetchInterval: 15000 })
  const scopedResources = resources.data?.filter(resource => scope !== 'MANAGEABLE' || actor?.role !== 'EMPLOYEE'
    || managementScope.data?.allResources || managementScope.data?.resourceIds.includes(resource.id))
  const client = useQueryClient()
  const rawPage = Number(url.state.page)
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 ? rawPage : 0
  const size = [10, 20, 50].includes(Number(url.state.size)) ? Number(url.state.size) : 10
  const filters = useMemo<ReservationFilters>(() => ({
    scope, resourceId: url.state.resourceId || undefined, locationId: url.state.locationId || undefined,
    customerId: url.state.customerId || undefined, page, size,
    status: statuses.find(status => status === url.state.status), employeeId: url.state.employeeId || undefined,
    from: url.state.from || undefined, to: url.state.to || undefined, search: url.state.search.trim() || undefined,
    sort: (['startTime', 'endTime', 'status', 'createdAt'].includes(url.state.sort) ? url.state.sort : 'startTime') as ReservationFilters['sort'],
    direction: url.state.direction === 'DESC' ? 'DESC' : 'ASC',
  }), [url.state, scope, page, size])
  const filterKey = JSON.stringify(filters)
  const summaryFilters = { scope, resourceId: filters.resourceId, locationId: filters.locationId, employeeId: filters.employeeId,
    customerId: filters.customerId, from: filters.from, to: filters.to, search: filters.search }
  const result = useQuery({ queryKey: queryKeys.reservations(`${actor?.id}:${filterKey}`),
    queryFn: () => reservationApi.list(filters), refetchInterval: 15000, refetchOnWindowFocus: true })
  const summary = useQuery({ queryKey: ['reservations', 'summary', actor?.id, summaryFilters],
    queryFn: () => reservationApi.summary(summaryFilters), refetchInterval: 15000, refetchOnWindowFocus: true })
  const refresh = () => client.invalidateQueries({ queryKey: ['reservations'] })
  const rows = result.error ? [] : result.data?.content ?? []
  const bulk = useMutation({
    mutationFn: async ({ status, reason }: { status: ReservationStatus; reason?: string }) => {
      const items = rows.filter(item => selected.has(item.id))
      if (result.error || items.length !== selected.size || !items.length
        || items.some(item => item.readOnly || !item.allowedActions?.includes(status))) throw new Error('Izbor više ne dozvoljava ovu grupnu akciju. Osvežite rezervacije.')
      return reservationApi.bulkStatus(status, items.map(({ id, version }) => ({ id, version })), reason)
    },
    onSuccess: async response => {
      setBulkSummary(`${response.succeeded} uspešno, ${response.failed} neuspešno.`)
      setSelected(new Set()); await refresh()
    }, onError: async () => { await refresh() },
  })
  const selectable = rows.filter(item => !item.readOnly && !!item.allowedActions?.length)
  const selectedItems = rows.filter(item => selected.has(item.id))
  const mayBulk = (status: ReservationStatus) => !result.error && !result.isFetching && selectedItems.length > 0
    && selectedItems.length === selected.size && selectedItems.every(item => !item.readOnly && item.allowedActions?.includes(status))
  const changeFilters = (changes: Partial<typeof baseDefaults>) => {
    if (bulk.isPending) return
    setSelected(new Set())
    url.set({ ...changes, page: '0', ...(changes.locationId !== undefined ? { resourceId: '' } : {}) })
  }
  useEffect(() => { setSelected(new Set()) }, [filterKey, actor?.id])
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selected.size > 0 && !selectable.every(item => selected.has(item.id))
  }, [selected, selectable])
  useEffect(() => {
    if (!result.data || result.error || result.isFetching || bulk.isPending) return
    if (page >= Math.max(1, result.data.totalPages)) {
      setSelected(new Set()); url.set({ page: String(Math.max(0, result.data.totalPages - 1)) }, true)
    }
  }, [result.data, result.error, result.isFetching, bulk.isPending, page, url.set])
  useEffect(() => {
    if (!resources.data || !url.state.resourceId || resources.isFetching || resources.error || bulk.isPending
      || scope === 'MANAGEABLE' && actor?.role === 'EMPLOYEE' && (!managementScope.data || managementScope.isFetching || managementScope.error)) return
    if (!scopedResources?.some(resource => resource.id === url.state.resourceId
      && (!url.state.locationId || resource.locationId === url.state.locationId))) {
      setSelected(new Set()); url.set({ resourceId: '', page: '0' }, true)
    }
  }, [resources.data, resources.isFetching, resources.error, scopedResources, scope, actor?.role,
    managementScope.data, managementScope.isFetching, managementScope.error, bulk.isPending, url.state.resourceId, url.state.locationId, url.set])
  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next
  })
  const openDetails = (reservation: Reservation, action?: ReservationDetailAction, target: HTMLButtonElement | null = null) => {
    returnFocus.current = target; setDetailAction({ id: reservation.id, action }); url.set({ reservationId: reservation.id })
  }
  const metrics = summary.error ? undefined : summary.data
  const kpis = [
    { label: 'Rezervacije danas', value: metrics?.todayReservations, icon: 'calendar' as const, tone: 'blue',
      hint: metrics ? calendarDate(metrics.today) : 'Današnji termini' },
    { label: 'Predstojeće rezervacije', value: metrics?.upcomingReservations, icon: 'clock' as const, tone: 'violet',
      hint: metrics ? `Narednih 7 dana · do ${calendarDate(metrics.upcomingThrough)}` : 'Narednih 7 dana' },
    { label: 'Klijenti', value: metrics?.uniqueCustomers, icon: 'users' as const, tone: 'blue',
      hint: metrics ? `${calendarDate(metrics.customersFrom)} – ${calendarDate(metrics.customersTo)}` : 'Jedinstveni klijenti u periodu' },
    { label: 'Otkazane rezervacije za današnje termine', value: metrics?.cancelledTodayAppointments, icon: 'cancel' as const, tone: 'pink',
      hint: 'Prema datumu termina, ne trenutku otkazivanja' },
  ]
  const filterError = resources.error || locations.error || employees.error || managementScope.error

  return <main className="workspace reservations-page">
    <header className="reservations-page-header">
      <div className="reservations-title"><span className="reservations-title-icon"><ReservationIcon /></span>
        <div><h1>Rezervacije</h1><p>Upravljanje terminima, rezervacijama i dostupnošću resursa.</p></div></div>
      <Button className="reservations-create-button" onClick={() => setCreateOpen(true)}><span aria-hidden="true">+</span> Nova rezervacija</Button>
    </header>
    <section className="reservations-kpis" aria-label="Statistika rezervacija" aria-busy={summary.isFetching}>
      {kpis.map(kpi => <article key={kpi.label} className={`reservations-kpi reservations-kpi--${kpi.tone}`}>
        <span className="reservations-kpi-label">{kpi.label}</span><ReservationIcon kind={kpi.icon} />
        {summary.isLoading ? <Skeleton lines={1} label={`Učitavanje: ${kpi.label}`} /> : <strong>{kpi.value?.toLocaleString('sr-Latn-RS') ?? '—'}</strong>}
        <small>{kpi.hint}</small>
      </article>)}
    </section>
    <p className="reservations-statistics-note">Statistika po opsegu, pretrazi, lokaciji, resursu, zaposlenom i klijentu; sve statusne kategorije.
      {metrics && ` Poslovna vremenska zona: ${metrics.timezone}.`}</p>
    {summary.error && <ErrorState message={apiErrorMessage(summary.error, 'Statistiku nije moguće učitati.')}
      action={<Button onClick={() => summary.refetch()}>Pokušaj ponovo</Button>} />}
    <section className="reservations-filter-panel" aria-label="Filteri rezervacija">
      <div className="reservations-filter-heading"><h2><ReservationIcon kind="filter" />Filteri i pretraga</h2>
        <Button type="button" variant="secondary" disabled={bulk.isPending} onClick={() => { setSelected(new Set()); url.apply({ scope }) }}>Resetuj filtere</Button></div>
      {actor?.role === 'EMPLOYEE' && <div className="reservations-scope-row">
        <ReservationScopeSwitch scope={scope} onChange={nextScope => changeFilters({ scope: nextScope })} />
        <p>{scope === 'MANAGEABLE' ? 'Rezervacije trenutno dodeljenih stanica.' : 'Pregled svih stanica; upravljanje samo na dodeljenim stanicama.'}</p>
      </div>}
      <fieldset className="reservations-filter-fields" disabled={bulk.isPending}>
        <legend className="reservations-sr-only">Osnovni filteri</legend>
        <label className="reservations-search">Pretraga rezervacija<span><ReservationIcon kind="search" />
          <input type="search" maxLength={120} value={url.state.search} placeholder="Klijent, usluga, resurs…"
            onChange={event => changeFilters({ search: event.target.value })} /></span></label>
        <label>Lokacija<select value={url.state.locationId} onChange={event => changeFilters({ locationId: event.target.value })}>
          <option value="">Sve lokacije</option>{locations.data?.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label>Resurs<select value={url.state.resourceId} onChange={event => changeFilters({ resourceId: event.target.value })}>
          <option value="">Svi resursi</option>{scopedResources?.filter(resource => !url.state.locationId || resource.locationId === url.state.locationId)
            .map(resource => <option key={resource.id} value={resource.id}>{resource.code} · {resource.name}</option>)}</select></label>
        <label>Status<select value={url.state.status} onChange={event => changeFilters({ status: event.target.value })}>
          <option value="">Svi statusi</option>{statuses.map(status => <option value={status} key={status}>{reservationLabels[status]}</option>)}</select></label>
        <div className="reservations-date-range"><label>Od<input type="date" value={url.state.from} max={url.state.to || undefined}
          onChange={event => changeFilters({ from: event.target.value })} /></label>
          <label>Do<input type="date" value={url.state.to} min={url.state.from || undefined} onChange={event => changeFilters({ to: event.target.value })} /></label></div>
      </fieldset>
      <Button type="button" variant="secondary" className="reservations-more-filters" disabled={bulk.isPending}
        aria-expanded={moreFilters} aria-controls="reservations-advanced-filters" onClick={() => setMoreFilters(!moreFilters)}>
        <ReservationIcon kind="filter" />Više filtera<span aria-hidden="true">{moreFilters ? '−' : '+'}</span>
      </Button>
      <fieldset id="reservations-advanced-filters" className="reservations-advanced-filters" hidden={!moreFilters} disabled={bulk.isPending}>
        <legend className="reservations-sr-only">Dodatni filteri</legend>
        <label>Zaposleni<select value={url.state.employeeId} onChange={event => changeFilters({ employeeId: event.target.value })}>
          <option value="">Svi zaposleni</option>{employees.data?.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
        <CustomerPicker value={url.state.customerId} disabled={bulk.isPending} onChange={customerId => changeFilters({ customerId })} />
        <label>Sortiranje<select value={`${filters.sort}:${filters.direction}`} onChange={event => {
          const [sort, direction] = event.target.value.split(':'); changeFilters({ sort, direction })
        }}><option value="startTime:ASC">Najraniji termin</option><option value="startTime:DESC">Najkasniji termin</option>
          <option value="createdAt:DESC">Najnoviji zahtev</option><option value="createdAt:ASC">Najstariji zahtev</option>
          <option value="status:ASC">Status · rastuće</option><option value="status:DESC">Status · opadajuće</option>
          <option value="endTime:ASC">Najraniji kraj</option><option value="endTime:DESC">Najkasniji kraj</option></select></label>
      </fieldset>
      {filterError && <ErrorState message={apiErrorMessage(filterError, 'Opcije filtera nije moguće učitati.')}
        action={<Button onClick={() => { void resources.refetch(); void locations.refetch(); void employees.refetch(); if (actor?.role === 'EMPLOYEE') void managementScope.refetch() }}>Pokušaj ponovo</Button>} />}
      <fieldset className="reservations-saved-views" disabled={bulk.isPending}><legend className="reservations-sr-only">Sačuvani prikazi</legend>
        <SavedViewBar resource="RESERVATIONS" query={{ ...url.queryObject, scope }} apply={query => {
          if (bulk.isPending) return
          setSelected(new Set()); setMoreFilters(Boolean(query.employeeId || query.customerId || query.sort || query.direction)); url.apply({ ...query, page: '0' })
        }} />
      </fieldset>
    </section>
    {bulkSummary && <p className="reservations-success" role="status">{bulkSummary}</p>}
    <section className="reservations-table-panel" aria-labelledby="reservations-table-title">
      <div className="reservations-table-heading"><h2 id="reservations-table-title">Pregled rezervacija</h2>
        <label className="reservations-select-page reservations-checkbox"><input ref={selectAll} type="checkbox"
          disabled={bulk.isPending || result.isFetching || !selectable.length} checked={selectable.length > 0 && selectable.every(item => selected.has(item.id))}
          onChange={event => setSelected(event.target.checked ? new Set(selectable.map(item => item.id)) : new Set())} />Izaberi stranicu</label>
        <label>Redova po stranici<select value={size} disabled={bulk.isPending} onChange={event => changeFilters({ size: event.target.value })}>
          {[10, 20, 50].map(count => <option key={count} value={count}>{count}</option>)}</select></label></div>
      <SelectionBar count={selected.size}>
        <Button loading={bulk.isPending} disabled={!mayBulk('CONFIRMED')} onClick={() => bulk.mutate({ status: 'CONFIRMED' })}>Potvrdi izabrane</Button>
        <Button variant="danger" disabled={!mayBulk('CANCELLED')} loading={bulk.isPending} onClick={() => setCancelOpen(true)}>Otkaži izabrane</Button>
        <Button variant="secondary" disabled={bulk.isPending} onClick={() => setSelected(new Set())}>Poništi izbor</Button>
      </SelectionBar>
      {(result.error || bulk.error) && <ErrorState message={apiErrorMessage(result.error || bulk.error, 'Operaciju nad rezervacijama nije moguće izvršiti.')}
        action={<Button onClick={() => result.refetch()}>Pokušaj ponovo</Button>} />}
      {result.isLoading ? <Skeleton lines={10} label="Učitavanje rezervacija" /> : !rows.length ?
        !result.error && <EmptyState title="Nema rezervacija" description="Promenite filtere ili period da biste pronašli druge termine." /> :
        <TableShell label="Rezervacije"><table className="reservations-table" role="table">
          <caption className="reservations-sr-only">Rezervacije sa dozvoljenim akcijama; vreme u poslovnoj vremenskoj zoni.</caption>
          <thead role="rowgroup"><tr role="row"><th scope="col" className="reservations-select-cell"><span className="reservations-sr-only">Izbor</span></th>
            {['Datum i vreme', 'Klijent', 'Usluga', 'Resurs', 'Lokacija', 'Trajanje', 'Status', 'Akcije'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody role="rowgroup">{rows.map(reservation => {
            const localDate = businessInstantToLocal(reservation.startTime).split('T')[0]
            const minutes = Math.round((Date.parse(reservation.endTime) - Date.parse(reservation.startTime)) / 60000)
            return <tr role="row" key={reservation.id} className={`${selected.has(reservation.id) ? 'reservations-row-selected ' : ''}${reservation.readOnly ? 'reservations-row-readonly' : ''}`}>
              <td role="cell" className="reservations-select-cell"><label className="reservations-checkbox"><input type="checkbox" checked={selected.has(reservation.id)}
                disabled={bulk.isPending || result.isFetching || !reservation.allowedActions?.length || !!reservation.readOnly}
                onChange={() => toggle(reservation.id)} aria-label={`Izaberi rezervaciju: ${reservation.customerName}, ${formatBusinessDateTime(reservation.startTime)}`} /></label></td>
              <td role="cell" className="reservations-date-cell"><time dateTime={reservation.startTime}><strong>{calendarDate(localDate)}</strong>
                <span>{formatBusinessTime(reservation.startTime)} – {formatBusinessTime(reservation.endTime)}</span></time>
                {businessInstantToLocal(reservation.endTime).split('T')[0] !== localDate && <small>Kraj: {formatBusinessDateTime(reservation.endTime)}</small>}</td>
              <td role="cell" className="reservations-customer-cell"><strong>{reservation.customerName ?? 'Klijent'}</strong>
                <small className="reservations-access-label">{reservation.readOnly ? 'Samo pregled' : 'Upravljanje'}</small></td>
              <td role="cell" className="reservations-service-cell"><span>{reservation.serviceName}</span><small>{reservation.employeeName}</small></td>
              <td role="cell" className="reservations-resource-cell">{reservation.resourceId ? <><strong>{reservation.resourceCode}</strong><small>{reservation.resourceName}</small></> :
                reservation.resourceRequired ? <span className="reservations-resource-warning"><span aria-hidden="true">!</span> Obavezni resurs nije dodeljen</span> : <span className="reservations-muted">Usluga bez fizičkog resursa</span>}</td>
              <td role="cell" className="reservations-location-cell">{reservation.locationName ?? 'Bez dodeljene lokacije'}</td>
              <td role="cell" className="reservations-duration-cell">{minutes} min</td>
              <td role="cell" className="reservations-status-cell"><Badge tone={reservationTones[reservation.status]}>{reservationLabels[reservation.status]}</Badge></td>
              <td role="cell" className="reservations-actions-cell"><ReservationRowActions reservation={reservation} disabled={bulk.isPending || !!result.error} onAction={openDetails} /></td>
            </tr>
          })}</tbody>
        </table></TableShell>}
      {result.data && !result.error && <Pagination numbered page={page} pageSize={size} totalPages={result.data.totalPages} totalElements={result.data.totalElements}
        loading={result.isFetching || bulk.isPending} onPageChange={nextPage => { setSelected(new Set()); url.set({ page: String(nextPage) }) }} />}
    </section>
    {(createOpen || url.state.create === 'true') && <StaffReservationForm onClose={() => { setCreateOpen(false); url.set({ create: '' }) }}
      onCreated={(id, notice) => { setCreateOpen(false); setBulkSummary(notice ?? 'Rezervacija je kreirana.'); setDetailAction(null); url.set({ create: '', reservationId: id }) }} />}
    <ReservationDetailsDrawer reservationId={url.state.reservationId || null} appearance="operations" returnFocusRef={returnFocus}
      initialAction={detailAction?.id === url.state.reservationId ? detailAction.action : undefined}
      onClose={() => { setDetailAction(null); url.set({ reservationId: '' }, true) }} />
    <ActionDialog open={cancelOpen} disabled={!mayBulk('CANCELLED')} title="Otkaži izabrane rezervacije"
      description="Svaka dozvoljena promena biće odmah sačuvana i evidentirana." confirmLabel="Otkaži rezervacije"
      reasonLabel="Razlog" reasonRequired danger loading={bulk.isPending} onClose={() => setCancelOpen(false)}
      onConfirm={async reason => { if (!reason || !mayBulk('CANCELLED')) return; await bulk.mutateAsync({ status: 'CANCELLED', reason }); setCancelOpen(false) }} />
  </main>
}

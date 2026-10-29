import { useResettableState } from '../components/useResettableState'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { waitlistApi } from '../api/waitlistApi'
import { resourceApi } from '../api/resourceApi'
import { Button, Drawer, Pagination, EmptyState, ErrorState, Input, Select, Skeleton, TableShell, PageHeader, PageLayout, StatCard, Card } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useListUrlState } from '../lists/useListUrlState'
import { CustomerPicker } from '../reservations/CustomerPicker'
import { formatBusinessTime } from '../reservations/dateTime'
import { useServerNow } from '../gaming/useServerNow'
import { WaitlistEntryDialog } from '../waitlist/WaitlistEntryDialog'
import { WaitlistDetailsPanel } from '../waitlist/WaitlistDetailsPanel'
import { WaitlistAvatar, WaitlistIcon, WaitlistMenu, WaitlistStatusBadge } from '../waitlist/waitlistPresentation'
import { resourceLabels, waitlistDate, waitlistError, waitlistLabels, waitlistFilterServices } from '../waitlist/waitlistPresentation.model'
import type { WaitlistDetail, WaitlistFilters, WaitlistOperationalEntry, WaitlistSort, WaitlistStatus } from '../types/waitlist.types'
import '../waitlist/waitlist.css'

const defaults = { search: '', status: '', page: '0', size: '20', customerId: '', date: '', serviceId: '', locationId: '', areaId: '', resourceId: '', sort: 'FIFO', entryId: '' }
const allowed = Object.keys(defaults) as (keyof typeof defaults)[]
const sortLabels: Record<WaitlistSort, string> = { FIFO: 'Najstarije prijave prvo', NEWEST: 'Najnovije prijave', START_ASC: 'Najbliži željeni termin', START_DESC: 'Najdalji željeni termin' }
export function WaitlistPage() {
  const actor = useAuthStore(state => state.user), client = useQueryClient(), toast = useToast()
  const url = useListUrlState(defaults, allowed), root = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const setUrl = url.set
  const newButton = useRef<HTMLButtonElement>(null), opener = useRef<HTMLElement | null>(null), formOpener = useRef<HTMLElement | null>(null)
  const [wide, setWide] = useState(false), [search, setSearch] = useResettableState(() => url.state.search, url.state.search)
  const [dialog, setDialog] = useState<{ entry?: WaitlistOperationalEntry } | null>(null), [opening, setOpening] = useState(false)
  const { confirm, confirmationDialog } = useConfirmDialog()
  const canManage = hasCapability(actor, 'WAITLIST_MANAGE'), canRead = hasCapability(actor, 'RESERVATION_READ_ALL')
  const page = Math.max(0, Math.floor(Number(url.state.page) || 0)), size = [10, 20, 50, 100].includes(Number(url.state.size)) ? Number(url.state.size) : 20
  const status: WaitlistFilters['status'] = url.state.status === 'ALL' ? 'ALL' : Object.hasOwn(waitlistLabels, url.state.status) ? url.state.status as WaitlistStatus : undefined
  const sort: WaitlistSort = Object.hasOwn(sortLabels, url.state.sort) ? url.state.sort as WaitlistSort : 'FIFO'
  const selected = url.state.entryId
useEffect(() => {
    if (search === url.state.search) return
    const timer = window.setTimeout(() => setUrl({ search: search.trim(), page: '0' }, true), 300)
    return () => window.clearTimeout(timer)
  }, [search, url.state.search, setUrl])
  useEffect(() => {
    if (!root.current) return
    const element = root.current
    const measure = () => setWide(element.getBoundingClientRect().width >= 1088)
    measure()
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure) }
    const observer = new ResizeObserver(measure); observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const filters = useQuery({ queryKey: ['resources', 'waitlist-filters', actor?.id], queryFn: resourceApi.reservationResources, enabled: canRead })
  const services = useQuery({ queryKey: ['catalog', 'waitlist-filter-services'], queryFn: waitlistFilterServices, enabled: canRead })
  const areas = useQuery({ queryKey: ['resources', 'areas', url.state.locationId], queryFn: () => resourceApi.areas(url.state.locationId), enabled: canRead && !!url.state.locationId })
  const statistics = useQuery({ queryKey: ['waitlist', 'statistics', actor?.id], queryFn: waitlistApi.statistics, enabled: canRead, refetchInterval: 15000 })
  const params: WaitlistFilters = { search: url.state.search || undefined, status, customerId: url.state.customerId || undefined,
    date: url.state.date || undefined, serviceId: url.state.serviceId || undefined, locationId: url.state.locationId || undefined,
    areaId: url.state.areaId || undefined, resourceId: url.state.resourceId || undefined, sort, page, size }
  const queue = useQuery({ queryKey: ['waitlist', 'operational', actor?.id, params], queryFn: () => waitlistApi.operational(params),
    enabled: canRead, refetchInterval: 15000, refetchIntervalInBackground: false })
  const detail = useQuery({ queryKey: ['waitlist', 'detail', actor?.id, selected], queryFn: () => waitlistApi.detail(selected),
    enabled: canRead && !!selected, refetchInterval: 15000, retry: false })
  const now = useServerNow(queue.data?.content[0]?.serverTime ?? statistics.data?.serverTime)
  const rows = queue.data?.content ?? [], resourceOptions = filters.data ?? []
  const locations = [...new Map(resourceOptions.map(item => [item.locationId, item.locationName])).entries()]
  const visibleResources = resourceOptions.filter(item => (!url.state.serviceId || item.serviceId === url.state.serviceId)
    && (!url.state.locationId || item.locationId === url.state.locationId) && (!url.state.areaId || item.areaId === url.state.areaId))
  useEffect(() => {
    if (queue.data && !queue.isFetching && page >= Math.max(1, queue.data.totalPages)) setUrl({ page: String(Math.max(0, queue.data.totalPages - 1)) }, true)
  }, [queue.data, queue.isFetching, page, setUrl])
  const changeFilters = (values: Partial<typeof defaults>) => setUrl({ ...values, page: '0' })
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['waitlist'] }) }
  const closeDetail = () => {
    setUrl({ entryId: '' })
    window.requestAnimationFrame(() => (opener.current?.isConnected ? opener.current : heading.current)?.focus({ preventScroll: true }))
  }
  const showDetails = (entry: WaitlistOperationalEntry, trigger: HTMLElement | null) => { opener.current = trigger; setUrl({ entryId: entry.id }) }
  const edit = async (entry: WaitlistOperationalEntry, trigger: HTMLElement | null) => {
    if (!canManage || opening || !entry.allowedActions.includes('EDIT')) return
    formOpener.current = trigger; setOpening(true)
    try {
      const fresh = await client.fetchQuery({ queryKey: ['waitlist', 'detail', actor?.id, entry.id], queryFn: () => waitlistApi.detail(entry.id), staleTime: 0 })
      if (!fresh.entry.allowedActions.includes('EDIT')) { toast('Prijava je promenjena i više ne može da se menja.', 'error'); await refresh(); return }
      setDialog({ entry: fresh.entry })
    } catch (cause) { toast(waitlistError(cause, 'Prijavu nije moguće otvoriti za izmenu.'), 'error') }
    finally { setOpening(false) }
  }
  const cancel = (entry: WaitlistOperationalEntry) => {
    if (!canManage || !entry.allowedActions.includes('CANCEL')) return
    confirm({ title: 'Otkaži prijavu', description: 'Da li želite da uklonite klijenta sa liste čekanja?', confirmLabel: 'Otkaži prijavu', cancelLabel: 'Odustani',
      variant: 'danger', reasonLabel: 'Razlog otkazivanja', reasonRequired: true, reasonMaxLength: 500, className: 'gm-waitlist-dialog', titleIcon: <WaitlistIcon kind="cancel" />,
      formatError: cause => waitlistError(cause, 'Prijavu nije moguće otkazati.'), onConfirm: async reason => {
        try { await waitlistApi.cancelManaged(entry.id, entry.version, reason ?? ''); toast('Prijava je otkazana.', 'success') }
        finally { await refresh() }
      } })
  }
  const saved = async (value: WaitlistDetail) => {
    toast(dialog?.entry ? 'Prijava je izmenjena.' : 'Prijava je dodata na listu čekanja.', 'success')
    setDialog(null)
    client.setQueryData(['waitlist', 'detail', actor?.id, value.entry.id], value)
    await refresh()
  }
  const newEntry = () => { formOpener.current = newButton.current; setDialog({}) }
  const pages = Math.max(1, queue.data?.totalPages ?? 1), total = queue.data?.totalElements ?? 0

  const hasFilters = Boolean(url.state.search || url.state.status || url.state.customerId || url.state.date || url.state.serviceId || url.state.locationId || url.state.areaId || url.state.resourceId)
  const actionDisabled = queue.isFetching || queue.isError || opening
  const detailsPanel = <WaitlistDetailsPanel detail={detail.data} loading={detail.isLoading} error={detail.error} fetching={detail.isFetching}
    selectedId={selected} inline={wide} onClose={closeDetail} onRefresh={() => void detail.refetch()} onEdit={(entry, trigger) => void edit(entry, trigger)} onCancel={cancel} />
  const kpis = [
    { key: 'active', title: 'Ukupno aktivnih prijava', icon: 'list', tone: 'blue', hint: 'Čekanje i poslate ponude' },
    { key: 'waiting', title: 'Čeka termin', icon: 'clock', tone: 'purple', hint: 'U automatskom FIFO redu' },
    { key: 'offered', title: 'Poslata ponuda', icon: 'offer', tone: 'blue', hint: 'Važeće, neistekle ponude' },
    { key: 'accepted', title: 'Prihvaćeno', icon: 'check', tone: 'green', hint: 'U tekućem mesecu' },
    { key: 'cancelled', title: 'Otkazano', icon: 'cancel', tone: 'pink', hint: 'U tekućem mesecu' },
  ] as const
  return <PageLayout ref={root} className="gm-waitlist">
    <PageHeader title="Lista čekanja" description={<>Pregled i upravljanje prijavama, slobodnim terminima i ponudama.</>} icon={<WaitlistIcon />} titleRef={heading} actions={<><div className="gm-waitlist-heading-actions">
      <Button type="button" variant="secondary" loading={queue.isFetching || statistics.isFetching} onClick={() => void refresh()}><WaitlistIcon kind="refresh" />Osveži</Button>
      {canManage && <Button ref={newButton} type="button" className="gm-waitlist-primary" onClick={newEntry}><WaitlistIcon kind="plus" />Dodaj na listu čekanja</Button>}</div></>} />
    {!canRead ? <ErrorState message="Nemate dozvolu za pregled operativne liste čekanja." /> : <>
      <div className="ui-stat-grid gm-waitlist-kpis">{kpis.map(kpi => <StatCard label={<>{kpi.title}</>} value={statistics.isLoading ? <Skeleton lines={1} label={`Učitavanje: ${kpi.title}`} />
          : <>{statistics.isError || !statistics.data ? '—' : new Intl.NumberFormat('sr-Latn-RS').format(statistics.data[kpi.key])}</>} icon={<WaitlistIcon kind={kpi.icon} />} description={<>{kpi.hint}</>} tone={kpi.tone} key={kpi.key} aria-label={kpi.title} />)}</div>
      {statistics.error && <ErrorState message="Statistiku nije moguće učitati." action={<Button variant="secondary" onClick={() => void statistics.refetch()}>Pokušaj ponovo</Button>} />}
      {statistics.data && <p className="gm-waitlist-period">Prihvaćene i otkazane prijave: {new Intl.DateTimeFormat('sr-Latn-RS', {timeZone: 'Europe/Belgrade', month: 'long', year: 'numeric'}).format(new Date(statistics.data.periodStart))}.
        {statistics.data.expiredOffers > 0 && <span> Istekle poslednje ponude: {statistics.data.expiredOffers}. Otkazivanje prijave je zasebno stanje.</span>}</p>}
      <section className="gm-waitlist-filters" aria-label="Filteri liste čekanja">
        <label className="gm-waitlist-search"><span className="sr-only">Pretraga liste čekanja</span><WaitlistIcon kind="search" /><Input type="search" value={search} maxLength={100}
          placeholder="Pretraži po klijentu, usluzi ili resursu..." onChange={event => setSearch(event.target.value)} /></label>
        <div className="gm-waitlist-filter-grid">
          <label>Status<Select aria-label={"Status"} value={status ?? ''} onChange={event => changeFilters({ status: event.target.value })}><option value="">Sve aktivne prijave</option>
            {Object.entries(waitlistLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="ALL">Svi statusi</option></Select></label>
          <label>Usluga<Select aria-label={"Usluga"} value={url.state.serviceId} disabled={services.isLoading} onChange={event => changeFilters({ serviceId: event.target.value, resourceId: '' })}><option value="">Sve usluge</option>
            {services.data?.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</Select></label>
          <label>Lokal<Select aria-label={"Lokal"} value={url.state.locationId} disabled={filters.isLoading} onChange={event => changeFilters({ locationId: event.target.value, areaId: '', resourceId: '' })}><option value="">Svi lokali</option>
            {locations.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</Select></label>
          <label>Zona<Select aria-label={"Zona"} value={url.state.areaId} disabled={!url.state.locationId || areas.isLoading} onChange={event => changeFilters({ areaId: event.target.value, resourceId: '' })}><option value="">Sve zone</option>
            {areas.data?.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</Select></label>
          <label>Resurs<Select aria-label={"Resurs"} value={url.state.resourceId} disabled={filters.isLoading} onChange={event => changeFilters({ resourceId: event.target.value })}><option value="">Svi resursi</option>
            {visibleResources.map(resource => <option key={resource.id} value={resource.id}>{resource.code} · {resource.name}</option>)}</Select></label>
          <label>Željeni datum<Input aria-label={"Željeni datum"} type="date" value={url.state.date} onChange={event => changeFilters({ date: event.target.value })} /></label>
          {hasCapability(actor, 'CUSTOMER_READ') && <CustomerPicker value={url.state.customerId} onChange={customerId => changeFilters({ customerId })} />}
          <label>Redosled čekanja<Select aria-label={"Redosled čekanja"} value={sort} onChange={event => changeFilters({ sort: event.target.value })}>{Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        </div>
        <div className="gm-waitlist-filter-footer"><small>Sortiranje pregleda ne menja automatski FIFO redosled.</small><Button type="button" variant="secondary" onClick={() => { setSearch(''); url.apply({}) }}>Poništi filtere</Button></div>
      </section>
      {(filters.error || services.error || areas.error) && <ErrorState message="Deo filtera nije moguće učitati." action={<Button variant="secondary" onClick={() => { void filters.refetch(); void services.refetch(); if (url.state.locationId) void areas.refetch() }}>Pokušaj ponovo</Button>} />}
      <div className={`gm-waitlist-layout${selected && wide ? ' has-details' : ''}`}><section className="gm-waitlist-list">
        <div className="gm-waitlist-list-heading"><h2>Prijave na listi čekanja <span>{total}</span></h2>{queue.isFetching && !queue.isLoading && <small role="status">Osvežavanje…</small>}</div>
        {queue.isLoading ? <Skeleton lines={8} label="Učitavanje prijava na listi čekanja" />
          : queue.error ? <ErrorState message={waitlistError(queue.error, 'Lista čekanja nije dostupna.')} action={<Button variant="secondary" onClick={() => void queue.refetch()}>Pokušaj ponovo</Button>} />
          : !rows.length ? <EmptyState title={hasFilters ? 'Nema prijava koje odgovaraju filterima.' : 'Nema prijava na listi čekanja.'}
            description={hasFilters ? 'Promenite pretragu ili poništite filtere.' : 'Dodajte prijavu za zauzet termin ili sačekajte prijavu klijenta.'}
            action={hasFilters ? <Button variant="secondary" onClick={() => { setSearch(''); url.apply({}) }}>Poništi filtere</Button> : canManage ? <Button className="gm-waitlist-primary" onClick={newEntry}>Dodaj na listu čekanja</Button> : undefined} />
          : <>
            <TableShell label="Prijave na listi čekanja" className="gm-waitlist-desktop"><table className="ui-data-table gm-waitlist-table"><thead><tr>
              <th scope="col">Klijent</th><th scope="col">Usluga</th><th scope="col">Željeni termin</th><th scope="col">Lokal / zona / resurs</th><th scope="col">Status</th><th scope="col">Datum prijave</th><th scope="col">Akcije</th>
            </tr></thead><tbody>{rows.map(entry => <tr key={entry.id} className={selected === entry.id ? 'is-selected' : ''} onClick={event => {
              if ((event.target as Element).closest('button,a,input')) return
              showDetails(entry, event.currentTarget.querySelector('button'))
            }}>
              <td><div className="gm-waitlist-customer"><WaitlistAvatar name={entry.customerName} /><div><Button variant="ghost" type="button" className="gm-waitlist-name" onClick={event => showDetails(entry, event.currentTarget)}>{entry.customerName}</Button>
                {entry.customerEmail && <small>{entry.customerEmail}</small>}</div></div></td>
              <td><strong>{entry.serviceName}</strong><small>{entry.durationMinutes} min{entry.resourceType ? ' · ' + (resourceLabels[entry.resourceType] ?? entry.resourceType) : ''}</small></td>
              <td><strong>{new Intl.DateTimeFormat('sr-Latn-RS', {timeZone: 'Europe/Belgrade', dateStyle: 'medium'}).format(new Date(entry.desiredStart))}</strong><small>{formatBusinessTime(entry.desiredStart)} – {entry.desiredEnd ? formatBusinessTime(entry.desiredEnd) : '—'}</small></td>
              <td><strong>{entry.resourceName || 'Bez određenog resursa'}</strong><small>{[entry.locationName, entry.areaName, entry.resourceCode].filter(Boolean).join(' · ') || 'Bez određenog lokala'}</small></td>
              <td><WaitlistStatusBadge entry={entry} now={now} /></td>
              <td><small>{waitlistDate(entry.createdAt)}</small></td>
              <td><WaitlistMenu entry={entry} disabled={actionDisabled} onDetails={trigger => showDetails(entry, trigger)} onEdit={trigger => void edit(entry, trigger)} onCancel={() => cancel(entry)} /></td>
            </tr>)}</tbody></table></TableShell>
            <div className="gm-waitlist-mobile">{rows.map(entry => <Card as="article" key={entry.id} className={`gm-waitlist-entry-card${selected === entry.id ? ' is-selected' : ''}`}>
              <header><div className="gm-waitlist-customer"><WaitlistAvatar name={entry.customerName} /><div><h3>{entry.customerName}</h3>{entry.customerEmail && <small>{entry.customerEmail}</small>}</div></div>
                <WaitlistMenu entry={entry} disabled={actionDisabled} onDetails={trigger => showDetails(entry, trigger)} onEdit={trigger => void edit(entry, trigger)} onCancel={() => cancel(entry)} /></header>
              <strong>{entry.serviceName} <small>· {entry.durationMinutes} min</small></strong><p>{waitlistDate(entry.desiredStart)}{entry.desiredEnd ? ' – ' + formatBusinessTime(entry.desiredEnd) : ''}</p>
              <small>{[entry.locationName, entry.areaName, entry.resourceName].filter(Boolean).join(' · ') || 'Bez određenog resursa'}</small><WaitlistStatusBadge entry={entry} now={now} />
              <Button type="button" variant="secondary" onClick={event => showDetails(entry, event.currentTarget)}>Detalji</Button></Card>)}</div>
          </>}
        {queue.data && !queue.isError && <Pagination numbered page={page} pageSize={size} totalPages={pages}
          totalElements={total} loading={queue.isFetching} label="Stranice liste čekanja"
          onPageChange={page => setUrl({ page: String(page) })} onPageSizeChange={size => changeFilters({ size: String(size) })} />}
      </section>{selected && wide && <aside className="gm-waitlist-panel">{detailsPanel}</aside>}</div>
      <Drawer open={!!selected && !wide} title="Detalji prijave" className="gm-waitlist-drawer" size="wide" returnFocusRef={opener} onClose={closeDetail}>{selected && !wide && detailsPanel}</Drawer>
    </>}
    {dialog && <WaitlistEntryDialog entry={dialog.entry} serverTime={statistics.data?.serverTime} returnFocusRef={formOpener} onClose={() => setDialog(null)} onSaved={saved} onConflict={refresh} />}
    {confirmationDialog}
  </PageLayout>
}

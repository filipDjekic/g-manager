import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { orderApi, type OrderFilters } from '../api/orderApi'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { Button, EmptyState, ErrorState, Input, Select, Skeleton } from '../components/ui'
import { orderLabels } from '../components/ui/statusPresentation'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { useListUrlState } from '../lists/useListUrlState'
import { OrderDetails } from '../order/OrderDetails'
import type { OrderAction } from '../order/OrderActionsMenu'
import { OrdersPagination } from '../order/OrdersPagination'
import { OrdersTable } from '../order/OrdersTable'
import { canChangeOrder, currentPeriod, orderActionLabels, orderErrorMessage, OrderIcon,
  orderMoney, periodDates, periodLabel, periodOptions, shortOrderId, validOrderDate } from '../order/orderPresentation'
import type { BulkItem, BulkOperationResponse } from '../types/bulk.types'
import type { ManagedOrder, OrderStatus } from '../types/order.types'
import '../order/orders.css'

const defaults = { page: '0', size: '10', status: '', handledBy: '', from: '', to: '', search: '',
  sort: 'createdAt', direction: 'DESC', focus: '' }
const allowed = ['page', 'size', 'status', 'handledBy', 'from', 'to', 'search', 'sort', 'direction', 'focus'] as const
const sorts = { createdAt: 'Datum kreiranja', updatedAt: 'Poslednja izmena', status: 'Status', totalPrice: 'Ukupan iznos' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const kpis = [
  { key: 'total', label: 'Ukupno narudžbina', icon: 'cart', tone: 'blue' },
  { key: 'completed', label: 'Završene narudžbine', icon: 'check', tone: 'green' },
  { key: 'inProgress', label: 'U pripremi', icon: 'clock', tone: 'purple' },
  { key: 'cancelled', label: 'Otkazane narudžbine', icon: 'cancel', tone: 'pink' },
] as const

export function OrdersPage() {
  const user = useAuthStore(state => state.user)
  const canRead = hasCapability(user, 'ORDER_READ_ALL')
  const canChange = hasCapability(user, 'ORDER_CHANGE_STATUS')
  const showHandler = (user?.role === 'ADMIN' || user?.role === 'OWNER') && hasCapability(user, 'EMPLOYEE_LIST')
  const url = useListUrlState(defaults, allowed), client = useQueryClient(), toast = useToast()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkResult, setBulkResult] = useState<BulkOperationResponse | null>(null)
  const [moreFilters, setMoreFilters] = useState(Boolean(url.state.handledBy) || url.state.sort !== defaults.sort || url.state.direction !== defaults.direction)
  const [customPeriod, setCustomPeriod] = useState(false)
  const [search, setSearch] = useState(url.state.search)
  const inFlight = useRef(false), refreshButton = useRef<HTMLButtonElement>(null), detailOpener = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const previousDetail = useRef('')
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(url.state.search), 300)
    return () => window.clearTimeout(timer)
  }, [url.state.search])
  const searchPending = search !== url.state.search
  const dateError = !validOrderDate(url.state.from) || !validOrderDate(url.state.to)
    ? 'Unesite ispravne datume perioda.' : url.state.from && url.state.to && url.state.from > url.state.to
      ? 'Datum početka ne može biti posle datuma završetka.' : ''
  const filterError = dateError || (url.state.handledBy && !uuid.test(url.state.handledBy) ? 'Izabrani zaposleni nije ispravan.' : '')
    || (url.state.search.length > 200 ? 'Pretraga može imati najviše 200 znakova.' : '')
  const filters = useMemo<OrderFilters>(() => ({
    page: /^\d+$/.test(url.state.page) ? Math.min(Number(url.state.page), 2147483647) : 0,
    size: [10, 20, 50].includes(Number(url.state.size)) ? Number(url.state.size) : 10,
    status: Object.hasOwn(orderLabels, url.state.status) ? url.state.status as OrderStatus : undefined,
    handledBy: url.state.handledBy || undefined, from: url.state.from || undefined, to: url.state.to || undefined,
    search: search.trim() || undefined,
    sort: Object.hasOwn(sorts, url.state.sort) ? url.state.sort as OrderFilters['sort'] : 'createdAt',
    direction: url.state.direction === 'ASC' ? 'ASC' : 'DESC',
  }), [url.state.page, url.state.size, url.state.status, url.state.handledBy, url.state.from, url.state.to, url.state.sort, url.state.direction, search])
  const result = useQuery({ queryKey: ['orders', 'list', user?.id, filters], queryFn: () => orderApi.list(filters),
    enabled: canRead && !filterError && !searchPending })
  const statisticsFilters = { from: filters.from, to: filters.to, handledBy: filters.handledBy }
  const statistics = useQuery({ queryKey: ['orders', 'statistics', user?.id, statisticsFilters],
    queryFn: () => orderApi.statistics(statisticsFilters), enabled: canRead && !dateError && (!filters.handledBy || uuid.test(filters.handledBy)) })
  const employees = useQuery({ queryKey: ['users', 'order-employees', user?.id], queryFn: userApi.employees,
    enabled: showHandler, staleTime: 120000 })
  const detailId = uuid.test(url.state.focus) ? url.state.focus : ''
  const detailKey = ['orders', 'detail', user?.id, detailId]
  const detail = useQuery({ queryKey: detailKey, queryFn: () => orderApi.detail(detailId), enabled: canRead && Boolean(detailId) })
  const selectionScope = JSON.stringify([user?.id, filters, url.state.search])
  useEffect(() => { setSelected(new Set()) }, [selectionScope])
  useEffect(() => {
    if (detailId && !detailOpener.current) detailOpener.current = refreshButton.current
    if (!detailId && previousDetail.current) {
      const target = detailOpener.current
      if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true })
      else heading.current?.focus({ preventScroll: true })
    }
    previousDetail.current = detailId
  }, [detailId])
  useEffect(() => {
    if (!result.data || result.isFetching || result.isError || searchPending || filterError) return
    const last = Math.max(0, result.data.totalPages - 1)
    if (filters.page > last) url.set({ page: String(last) }, true)
  }, [result.data, result.isFetching, result.isError, filters.page, searchPending, filterError, url.set])

  const refresh = () => client.invalidateQueries({ queryKey: ['orders'] })
  const transition = useMutation({
    mutationFn: async ({ order, next }: { order: ManagedOrder; next: OrderStatus }) => {
      if (inFlight.current) throw new Error('Sačekajte završetak trenutne akcije.')
      if (!canChangeOrder(order, next, user)) throw new Error('Ova akcija nije dostupna.')
      inFlight.current = true
      try { return await orderApi.changeStatus(order, next) } finally { inFlight.current = false }
    },
    onSuccess: async (updated, { order }) => {
      const key = ['orders', 'detail', user?.id, updated.id]
      client.setQueryData<ManagedOrder>(key, current => ({ ...(current ?? order), ...updated,
        handledByName: user && updated.handledBy === user.id ? user.name : (current ?? order).handledByName,
        items: updated.items.map(item => ({ ...item,
          productName: (current ?? order).items.find(value => value.productId === item.productId)?.productName ?? null,
          productImageUrl: (current ?? order).items.find(value => value.productId === item.productId)?.productImageUrl ?? null })) }))
      await refresh()
      toast(`Status narudžbine je ažuriran: ${orderLabels[updated.status]}.`, 'success')
    },
    onError: cause => {
      void refresh()
      toast(orderErrorMessage(cause, 'Promena statusa nije potvrđena. Osvežite podatke pre ponovnog pokušaja.'), 'error')
    },
  })
  const bulk = useMutation({
    mutationFn: async ({ status, items }: { status: OrderStatus; items: BulkItem[] }) => {
      if (inFlight.current) throw new Error('Sačekajte završetak trenutne akcije.')
      setBulkResult(null)
      inFlight.current = true
      try { return await orderApi.bulkStatus(status, items) } finally { inFlight.current = false }
    },
    onSuccess: async response => {
      setBulkResult(response); setSelected(new Set()); await refresh()
      toast(`${response.succeeded} uspešno, ${response.failed} neuspešno.`, response.failed ? 'info' : 'success')
    },
    onError: cause => { void refresh(); toast(orderErrorMessage(cause, 'Ishod grupne akcije nije potvrđen. Osvežite podatke pre ponovnog pokušaja.'), 'error') },
  })
  const busy = transition.isPending || bulk.isPending
  const orders = result.data?.content ?? []
  const selectedOrders = orders.filter(order => selected.has(order.id))
  const mayBulk = (status: OrderStatus) => !busy && !result.isFetching && !result.error && !filterError && !searchPending
    && selectedOrders.length > 0 && selectedOrders.length === selected.size && selectedOrders.every(order => canChangeOrder(order, status, user))
  function setFilter(changes: Partial<typeof defaults>) {
    if (busy) return
    setSelected(new Set()); setBulkResult(null); transition.reset(); bulk.reset()
    url.set({ ...changes, page: '0', focus: '' })
  }
  function clearFilters() {
    setCustomPeriod(false); setMoreFilters(false)
    setFilter({ status: '', handledBy: '', from: '', to: '', search: '', sort: 'createdAt', direction: 'DESC' })
  }
  function retry() { transition.reset(); bulk.reset(); void refresh() }
  function statusAction(order: ManagedOrder, next: OrderStatus) {
    if (busy || !canChangeOrder(order, next, user)) return
    transition.reset()
    confirm({ title: orderActionLabels[next] ?? 'Promeni status narudžbine', variant: next === 'CANCELLED' ? 'danger' : 'default',
      confirmLabel: orderActionLabels[next], errorMessage: 'Promenu statusa nije moguće izvršiti.',
      formatError: cause => orderErrorMessage(cause, 'Promena statusa nije potvrđena. Osvežite podatke pre ponovnog pokušaja.'),
      description: <><strong>{shortOrderId(order.id)} · {orderMoney.format(order.totalPrice)}</strong><p>
        {next === 'CANCELLED' ? 'Narudžbina će biti otkazana. Dalja obrada neće biti moguća.' : `${orderLabels[order.status]} → ${orderLabels[next]}.`}
        {next === 'COMPLETED' && ' Narudžbina će biti završena i više se neće moći menjati.'}</p></>,
      onConfirm: () => transition.mutateAsync({ order, next }),
    })
  }
  function rowAction(order: ManagedOrder, action: OrderAction, trigger: HTMLButtonElement) {
    if (action !== 'DETAILS') { statusAction(order, action); return }
    detailOpener.current = trigger
    client.setQueryData<ManagedOrder>(['orders', 'detail', user?.id, order.id], current => !current || current.version <= order.version ? order : current)
    transition.reset(); url.set({ focus: order.id })
  }
  function bulkAction(status: 'IN_PROGRESS' | 'CANCELLED') {
    if (!mayBulk(status)) return
    const items = selectedOrders.map(({ id, version }) => ({ id, version }))
    bulk.reset()
    confirm({ title: status === 'CANCELLED' ? 'Otkaži izabrane narudžbine' : 'Preuzmi izabrane narudžbine',
      variant: status === 'CANCELLED' ? 'danger' : 'default', confirmLabel: status === 'CANCELLED' ? 'Otkaži izabrane' : 'Preuzmi izabrane',
      formatError: cause => orderErrorMessage(cause, 'Ishod grupne akcije nije potvrđen. Osvežite podatke pre ponovnog pokušaja.'),
      description: <><strong>Izabrano: {items.length}</strong><p>{status === 'CANCELLED' ? 'Izabrane narudžbine biće otkazane. Dalja obrada neće biti moguća.' : 'Preuzećete izabrane narudžbine i započeti njihovu pripremu.'}</p></>,
      onConfirm: () => bulk.mutateAsync({ status, items }),
    })
  }
  const period = customPeriod ? 'CUSTOM' : currentPeriod(url.state.from, url.state.to)
  const handler = user && filters.handledBy === user.id ? `${user.name} (vi)`
    : employees.data?.find(employee => employee.id === filters.handledBy)?.name ?? 'Izabrana osoba'
  const listLoading = result.isLoading || searchPending
  const listError = result.error || transition.error || bulk.error
  const savedQuery = Object.fromEntries(Object.entries(url.queryObject).filter(([key]) => key !== 'focus'))

  if (!canRead) return <main className="workspace gm-orders"><ErrorState title="Pristup nije dostupan" message="Nemate dozvolu za pregled narudžbina." /></main>
  return <main className="workspace gm-orders">
    {confirmationDialog}
    <header className="gm-orders-heading"><div className="gm-orders-title"><span className="gm-orders-heading-icon"><OrderIcon /></span>
      <div><h1 ref={heading} tabIndex={-1}>Narudžbine</h1><p>Pregled i upravljanje narudžbinama proizvoda.</p></div></div>
      <Button ref={refreshButton} type="button" variant="secondary" disabled={busy || Boolean(filterError) || searchPending}
        loading={result.isFetching || statistics.isFetching || detail.isFetching} onClick={retry}><OrderIcon kind="refresh" />Osveži</Button>
    </header>
    <section className="gm-orders-statistics" aria-label="Statistika narudžbina">
      <p className="gm-orders-statistics-scope">Statistika: {!dateError ? periodLabel(statistics.data?.from ?? filters.from, statistics.data?.to ?? filters.to) : 'Neispravan period'}
        {filters.handledBy ? ` · Obrađuje: ${handler}` : ' · Sve dostupne narudžbine'} · Nezavisno od pretrage i status filtera</p>
      <div className="gm-orders-kpis">{kpis.map(kpi => <article key={kpi.key} className={`gm-orders-kpi gm-orders-kpi--${kpi.tone}`}>
        <div><span>{kpi.label}</span>{statistics.isLoading ? <Skeleton lines={1} label={`Učitavanje: ${kpi.label}`} />
          : <strong>{statistics.data && !dateError ? statistics.data[kpi.key].toLocaleString('sr-Latn-RS') : '—'}</strong>}</div>
        <span className="gm-orders-kpi-icon"><OrderIcon kind={kpi.icon} /></span>
      </article>)}</div>
      {statistics.isError && <ErrorState title="Statistika nije dostupna" message={orderErrorMessage(statistics.error, 'Statistiku nije moguće učitati.')}
        action={<Button type="button" variant="secondary" onClick={() => statistics.refetch()}>Pokušaj ponovo</Button>} />}
    </section>
    <section className="gm-orders-filters" aria-label="Filteri narudžbina">
      <div className="gm-orders-filter-main">
        <label className="gm-orders-search"><span>Pretraga</span><div><OrderIcon kind="search" /><Input type="search" maxLength={200}
          placeholder="Pretraži narudžbine, klijente ili proizvode..." value={url.state.search} disabled={busy}
          onChange={event => setFilter({ search: event.target.value })} /></div></label>
        <label>Status<Select value={filters.status ?? ''} disabled={busy} onChange={event => setFilter({ status: event.target.value })}>
          <option value="">Svi statusi</option>{Object.entries(orderLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select></label>
        <label>Period<Select value={period} disabled={busy} onChange={event => {
          setCustomPeriod(event.target.value === 'CUSTOM')
          if (event.target.value !== 'CUSTOM') setFilter(periodDates(event.target.value))
        }}>{periodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <Button type="button" variant="secondary" aria-expanded={moreFilters} aria-controls="gm-orders-extra-filters" disabled={busy}
          onClick={() => setMoreFilters(!moreFilters)}><OrderIcon kind="filter" />Više filtera</Button>
      </div>
      {period === 'CUSTOM' && <div className="gm-orders-period-fields">
        <label>Od<Input type="date" value={url.state.from} disabled={busy} aria-invalid={Boolean(dateError)}
          onChange={event => { setCustomPeriod(true); setFilter({ from: event.target.value }) }} /></label>
        <label>Do<Input type="date" value={url.state.to} disabled={busy} aria-invalid={Boolean(dateError)}
          onChange={event => { setCustomPeriod(true); setFilter({ to: event.target.value }) }} /></label>
      </div>}
      <div id="gm-orders-extra-filters" className="gm-orders-extra-filters" hidden={!moreFilters}>
        {showHandler && <label>Obrađuje<Select value={url.state.handledBy} disabled={busy || employees.isLoading}
          onChange={event => setFilter({ handledBy: event.target.value })}><option value="">Svi zaposleni</option>
          {user && !employees.data?.some(employee => employee.id === user.id) && <option value={user.id}>{user.name} (vi)</option>}
          {employees.data?.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          {url.state.handledBy && url.state.handledBy !== user?.id && !employees.data?.some(employee => employee.id === url.state.handledBy)
            && <option value={url.state.handledBy}>Izabrana osoba nije dostupna</option>}
        </Select>{employees.isError && <span className="gm-orders-field-error" role="alert">Spisak zaposlenih nije dostupan.
          <button type="button" disabled={busy} onClick={() => employees.refetch()}>Pokušaj ponovo</button></span>}</label>}
        <label>Sortiranje<Select value={filters.sort} disabled={busy} onChange={event => setFilter({ sort: event.target.value })}>
          {Object.entries(sorts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select></label>
        <label>Redosled<Select value={filters.direction} disabled={busy} onChange={event => setFilter({ direction: event.target.value })}>
          <option value="DESC">Opadajuće</option><option value="ASC">Rastuće</option></Select></label>
      </div>
      {filterError && <p className="gm-orders-field-error" role="alert">{filterError}</p>}
      <div className="gm-orders-filter-bottom"><SavedViewBar resource="ORDERS" query={savedQuery} apply={query => {
        if (busy) return
        setSelected(new Set()); setBulkResult(null); setCustomPeriod(false); transition.reset(); bulk.reset()
        setMoreFilters(Boolean(query.handledBy) || Boolean(query.sort && query.sort !== defaults.sort) || Boolean(query.direction && query.direction !== defaults.direction))
        url.apply({ ...query, page: '0', focus: '' })
      }} /><Button type="button" variant="secondary" disabled={busy} onClick={clearFilters}>Poništi filtere</Button></div>
    </section>
    <section className="gm-orders-list" aria-label="Lista narudžbina" aria-busy={listLoading || result.isFetching}>
      {canChange && <SelectionBar count={selected.size} summary={bulkResult ? `${bulkResult.succeeded} uspešno, ${bulkResult.failed} neuspešno.` : ''}>
        <Button type="button" disabled={!mayBulk('IN_PROGRESS')} loading={bulk.isPending} onClick={() => bulkAction('IN_PROGRESS')}>Preuzmi izabrane</Button>
        <Button type="button" variant="danger" disabled={!mayBulk('CANCELLED')} loading={bulk.isPending} onClick={() => bulkAction('CANCELLED')}>Otkaži izabrane</Button>
        {selected.size > 0 && <Button type="button" variant="secondary" disabled={busy} onClick={() => setSelected(new Set())}>Poništi izbor</Button>}
        {bulkResult && <Button type="button" variant="secondary" disabled={busy} onClick={() => setBulkResult(null)}>Zatvori rezultat</Button>}
      </SelectionBar>}
      {bulkResult && bulkResult.failed > 0 && <div className="gm-orders-bulk-failures" role="alert"><strong>Narudžbine koje nisu promenjene</strong>
        <ul>{bulkResult.outcomes.filter(outcome => !outcome.success).map(outcome => <li key={outcome.id}>
          <span title={outcome.id}>{shortOrderId(outcome.id)}</span> · {orderErrorMessage(new Error(outcome.message), 'Promena nije izvršena.')}</li>)}</ul></div>}
      {Boolean(listError) && <ErrorState title={result.error ? 'Narudžbine nisu dostupne' : 'Akcija nije potvrđena'}
        message={orderErrorMessage(listError, 'Narudžbine nije moguće učitati.')} action={<Button type="button" variant="secondary" disabled={busy} onClick={retry}>Pokušaj ponovo</Button>} />}
      {listLoading && !filterError ? <div className="gm-orders-list-skeleton"><Skeleton lines={6} label="Učitavanje narudžbina" /></div>
        : !filterError && result.data && orders.length === 0 && !result.error ? <EmptyState title="Nema narudžbina" description="Za izabranu pretragu i period nema narudžbina."
          action={<Button type="button" variant="secondary" disabled={busy} onClick={clearFilters}>Poništi filtere</Button>} />
        : !filterError && !searchPending && orders.length > 0 && <OrdersTable orders={orders} user={user} selected={selected} detailId={detailId}
          busy={busy || result.isFetching || Boolean(result.error)} onSelect={order => setSelected(current => {
            const next = new Set(current)
            if (next.has(order.id)) next.delete(order.id)
            else if (canChangeOrder(order, 'IN_PROGRESS', user) || canChangeOrder(order, 'CANCELLED', user)) next.add(order.id)
            return next
          })} onSelectAll={ids => setSelected(new Set(ids))} onAction={rowAction} />}
      {result.data && !filterError && !searchPending && <OrdersPagination page={Math.min(filters.page, Math.max(0, result.data.totalPages - 1))} size={filters.size}
        totalPages={result.data.totalPages} totalElements={result.data.totalElements} busy={busy || result.isFetching}
        onPage={page => { setSelected(new Set()); setBulkResult(null); url.set({ page: String(page), focus: '' }) }} onSize={size => setFilter({ size: String(size) })} />}
    </section>
    {detailId && <OrderDetails key={detailId} order={detail.data} user={user} loading={detail.isLoading} error={detail.error}
      busy={busy} returnFocusRef={detailOpener} onClose={() => url.set({ focus: '' })}
      onRefresh={() => { transition.reset(); void detail.refetch() }} onStatus={statusAction} />}
  </main>
}

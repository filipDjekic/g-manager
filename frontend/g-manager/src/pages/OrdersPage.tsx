import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { orderApi } from '../api/orderApi'
import { customerApi } from '../api/customerApi'
import { userApi } from '../api/userApi'
import { catalogApi } from '../api/catalogApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { Pagination, Badge, Button, Drawer, EmptyState, ErrorState, Skeleton, TableShell } from '../components/ui'
import { orderLabels, orderTones } from '../components/ui/statusPresentation'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { useListUrlState } from '../lists/useListUrlState'
import { queryKeys } from '../query/queryKeys'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { Order, OrderStatus } from '../types/order.types'

const defaults = { page: '0', status: 'CREATED', handledBy: '', from: '', to: '', sort: 'createdAt', direction: 'DESC' }
const allowed = ['page', 'status', 'handledBy', 'from', 'to', 'sort', 'direction'] as const

export function OrdersPage() {
  const user = useAuthStore((state) => state.user)
  const management = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canChange = hasCapability(user, 'ORDER_CHANGE_STATUS')
  const url = useListUrlState(defaults, allowed)
  const client = useQueryClient(), toast = useToast()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [bulkSummary, setBulkSummary] = useState('')
  const filters = useMemo(() => ({
    page: Math.max(0, Number(url.state.page) || 0), size: 20,
    status: (url.state.status || undefined) as OrderStatus | undefined,
    handledBy: url.state.handledBy || undefined, from: url.state.from || undefined, to: url.state.to || undefined,
    sort: url.state.sort as 'createdAt' | 'status' | 'totalPrice', direction: url.state.direction as 'ASC' | 'DESC',
  }), [url.state])
  const result = useQuery({ queryKey: queryKeys.orders(url.query), queryFn: () => orderApi.list(filters) })
  const employees = useQuery({ queryKey: ['users', 'order-employees'], queryFn: userApi.employees,
    enabled: hasCapability(user, 'EMPLOYEE_LIST') })
  const customerIds = [...new Set((result.data?.content ?? []).map((order) => order.customerId))]
  const customers = useQueries({ queries: customerIds.map((id) => ({ queryKey: queryKeys.customerDetail(id),
    queryFn: () => customerApi.detail(id), enabled: hasCapability(user, 'CUSTOMER_READ'), staleTime: 120000 })) })
  const customerName = (id: string) => {
    const query = customers[customerIds.indexOf(id)]
    return query?.data?.customer.name ?? (query?.isLoading ? 'Učitavanje klijenta…' : 'Klijent nije dostupan')
  }
  const handlerName = (id: string | null) => !id ? 'Nepreuzeta' : id === user?.id ? `${user.name} (vi)` :
    employees.data?.find((employee) => employee.id === id)?.name ?? 'Osoba nije dostupna'
  const detail = result.data?.content.find((order) => order.id === detailId)
  const products = useQuery({ queryKey: ['catalog', 'order-details'],
    queryFn: () => catalogApi.list({ page: 0, size: 100, type: 'PRODUCT', sort: 'name', direction: 'ASC' }),
    enabled: Boolean(detail) && hasCapability(user, 'CATALOG_READ') })
  const refresh = () => client.invalidateQueries({ queryKey: ['orders'] })
  const transition = useMutation({ mutationFn: ({ order, next }: { order: Order; next: OrderStatus }) =>
    orderApi.changeStatus(order, next), onSuccess: async () => { await refresh(); toast('Status narudžbine je ažuriran.', 'success') } })
  const canCancel = (order: Order) => canChange && (order.status === 'CREATED' ||
    (order.status === 'IN_PROGRESS' && (order.handledBy === user?.id || management)) || (order.status === 'READY' && management))
  const selectedOrders = (result.data?.content ?? []).filter(({ id }) => selected.has(id))
  const mayBulk = (status: OrderStatus) => canChange && !result.error && selectedOrders.length > 0 && selectedOrders.length === selected.size &&
    selectedOrders.every((order) => status === 'IN_PROGRESS' ? order.status === 'CREATED' : canCancel(order))
  const bulk = useMutation({ mutationFn: (status: OrderStatus) => orderApi.bulkStatus(status,
    selectedOrders.map(({ id, version }) => ({ id, version }))), onSuccess: async (response) => {
      setBulkSummary(`${response.succeeded} uspešno, ${response.failed} neuspešno.`); setSelected(new Set()); await refresh()
    } })
  const error = result.error || transition.error || bulk.error
  const busy = transition.isPending || bulk.isPending
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next
  })
  const setFilter = (patch: Partial<typeof defaults>) => { setSelected(new Set()); setDetailId(null); url.set(patch) }
  const cancel = (order: Order) => confirm({ title: 'Otkaži narudžbinu',
    description: `${customerName(order.customerId)} · ${order.totalPrice.toLocaleString('sr-RS')} RSD. Narudžbina će biti otkazana.`,
    variant: 'danger', confirmLabel: 'Otkaži narudžbinu', onConfirm: () => transition.mutateAsync({ order, next: 'CANCELLED' }) })

  return <main className="workspace">{confirmationDialog}
    <div className="page-heading"><div><p className="eyebrow">Operativa</p><h1>Narudžbine</h1><p>Preuzimanje, priprema i izdavanje narudžbina.</p></div>
      <Button variant="secondary" loading={result.isFetching} onClick={() => result.refetch()}>Osveži</Button></div>
    <SavedViewBar resource="ORDERS" query={url.queryObject} apply={(query) => { setSelected(new Set()); url.apply(query) }} />
    {error && <ErrorState message={apiErrorMessage(error, 'Operaciju nad narudžbinama nije moguće izvršiti.')}
      action={<Button onClick={() => result.refetch()}>Pokušaj ponovo</Button>} />}
    <div className="filter-bar reservation-filters">
      <label>Status<select value={url.state.status} onChange={(event) => setFilter({ status: event.target.value, page: '0' })}>
        <option value="">Svi statusi</option>{Object.entries(orderLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      {management && hasCapability(user, 'EMPLOYEE_LIST') && <label>Obrađuje<select value={url.state.handledBy}
        disabled={employees.isLoading} onChange={(event) => setFilter({ handledBy: event.target.value, page: '0' })}>
        <option value="">Svi zaposleni</option>{user && !employees.data?.some((employee) => employee.id === user.id) && <option value={user.id}>{user.name} (vi)</option>}
        {employees.data?.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        {url.state.handledBy && url.state.handledBy !== user?.id && !employees.data?.some((employee) => employee.id === url.state.handledBy) &&
          <option value={url.state.handledBy}>Izabrana osoba nije dostupna</option>}
      </select>{employees.error && <span className="field-error" role="alert">Spisak zaposlenih nije dostupan.</span>}</label>}
      <label>Od<input type="date" value={url.state.from} onChange={(event) => setFilter({ from: event.target.value, page: '0' })} /></label>
      <label>Do<input type="date" value={url.state.to} onChange={(event) => setFilter({ to: event.target.value, page: '0' })} /></label>
      <label>Redosled<select value={`${url.state.sort}:${url.state.direction}`} onChange={(event) => {
        const [sort, direction] = event.target.value.split(':'); setFilter({ sort, direction, page: '0' })
      }}><option value="createdAt:DESC">Najnovije</option><option value="createdAt:ASC">Najstarije</option><option value="totalPrice:DESC">Najveći iznos</option></select></label>
      <Button variant="secondary" onClick={() => { setSelected(new Set()); url.apply({}) }}>Poništi filtere</Button>
    </div>
    {canChange && <SelectionBar count={selected.size} summary={bulkSummary}>
      <Button disabled={!mayBulk('IN_PROGRESS')} loading={busy} onClick={() => bulk.mutate('IN_PROGRESS')}>Preuzmi izabrane</Button>
      <Button variant="danger" disabled={!mayBulk('CANCELLED')} loading={busy} onClick={() => confirm({ title: 'Otkaži izabrane narudžbine',
        description: `${selected.size} narudžbina biće otkazano.`, variant: 'danger', confirmLabel: 'Otkaži narudžbine', onConfirm: () => bulk.mutateAsync('CANCELLED') })}>Otkaži izabrane</Button>
    </SelectionBar>}
    {result.isLoading ? <Skeleton lines={6} label="Učitavanje narudžbina" /> : !result.data?.content.length ?
      <EmptyState title="Nema narudžbina" description="Promenite filtere ili period." /> :
      <section className="reservation-list">{result.data.content.map((order) => {
        const own = order.handledBy === user?.id
        return <article className="panel order-row management" key={order.id}>
          {canChange && <label className="row-selector"><input type="checkbox" checked={selected.has(order.id)} disabled={busy || !canCancel(order)}
            onChange={() => toggle(order.id)} aria-label={`Izaberi narudžbinu za ${customerName(order.customerId)}`} /></label>}
          <div><strong>{customerName(order.customerId)}</strong><p><time dateTime={order.createdAt}>{formatBusinessDateTime(order.createdAt)}</time></p>
            <small>{order.items.length} stavki · {handlerName(order.handledBy)}</small></div>
          <div className="order-status"><strong>{order.totalPrice.toLocaleString('sr-RS', { minimumFractionDigits: 2 })} RSD</strong><Badge tone={orderTones[order.status]}>{orderLabels[order.status]}</Badge></div>
          <div className="card-actions"><Button variant="secondary" onClick={() => setDetailId(order.id)}>Detalji</Button>
            {canChange && order.status === 'CREATED' && <Button loading={busy} onClick={() => transition.mutate({ order, next: 'IN_PROGRESS' })}>Preuzmi</Button>}
            {canChange && order.status === 'IN_PROGRESS' && (own || management) && <Button loading={busy} onClick={() => transition.mutate({ order, next: 'READY' })}>Označi spremno</Button>}
            {canChange && order.status === 'READY' && (own || management) && <Button loading={busy} onClick={() => transition.mutate({ order, next: 'COMPLETED' })}>Označi preuzeto</Button>}
            {canCancel(order) && <Button variant="danger" disabled={busy} onClick={() => cancel(order)}>Otkaži</Button>}
          </div>
        </article>
      })}</section>}
    <Pagination page={filters.page} totalPages={result.data?.totalPages} onPageChange={(page) => setFilter({ page: String(page) })} loading={result.isFetching} />
    <Drawer size="wide" open={Boolean(detail)} title="Detalji narudžbine" onClose={() => setDetailId(null)}>
      {detail && <div className="form-grid"><div className="section-heading"><strong>{customerName(detail.customerId)}</strong><Badge tone={orderTones[detail.status]}>{orderLabels[detail.status]}</Badge></div>
        <p>{formatBusinessDateTime(detail.createdAt)} · {handlerName(detail.handledBy)}</p>
        <TableShell label="Stavke narudžbine"><table className="responsive-table"><thead><tr><th>Proizvod</th><th>Količina</th><th>Jedinična cena</th><th>Ukupno</th></tr></thead><tbody>
          {detail.items.map((item, index) => <tr key={`${item.productId}-${index}`}><td data-label="Proizvod">{products.data?.content.find((product) => product.id === item.productId)?.name ?? `Stavka ${index + 1}`}</td>
            <td data-label="Količina">{item.quantity}</td><td data-label="Cena">{item.unitPrice.toLocaleString('sr-RS')} RSD</td><td data-label="Ukupno">{item.lineTotal.toLocaleString('sr-RS')} RSD</td></tr>)}
        </tbody></table></TableShell><strong>Ukupno: {detail.totalPrice.toLocaleString('sr-RS')} RSD</strong>
        <small>Nazivi proizvoda prikazani su iz dostupnog kataloga.</small>
      </div>}
    </Drawer>
  </main>
}

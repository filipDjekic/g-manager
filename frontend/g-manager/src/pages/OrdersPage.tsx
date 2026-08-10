import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { orderApi } from '../api/orderApi'
import { useAuthStore } from '../auth/authStore'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { useListUrlState } from '../lists/useListUrlState'
import { queryKeys } from '../query/queryKeys'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { Order, OrderStatus } from '../types/order.types'

const defaults = { page: '0', status: 'CREATED', handledBy: '', from: '', to: '', sort: 'createdAt', direction: 'DESC' }
const allowed = ['page', 'status', 'handledBy', 'from', 'to', 'sort', 'direction'] as const

export function OrdersPage() {
  const user = useAuthStore((state) => state.user)
  const url = useListUrlState(defaults, allowed)
  const client = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSummary, setBulkSummary] = useState('')
  const filters = useMemo(() => ({
    page: Math.max(0, Number(url.state.page) || 0), size: 20,
    status: (url.state.status || undefined) as OrderStatus | undefined,
    handledBy: url.state.handledBy || undefined, from: url.state.from || undefined, to: url.state.to || undefined,
    sort: url.state.sort as 'createdAt' | 'status' | 'totalPrice', direction: url.state.direction as 'ASC' | 'DESC',
  }), [url.state])
  const result = useQuery({ queryKey: queryKeys.orders(url.query), queryFn: () => orderApi.list(filters) })
  const refresh = () => client.invalidateQueries({ queryKey: ['orders'] })
  const transition = useMutation({ mutationFn: ({ order, next }: { order: Order; next: OrderStatus }) =>
    orderApi.changeStatus(order, next), onSuccess: refresh })
  const bulk = useMutation({ mutationFn: async (status: OrderStatus) => orderApi.bulkStatus(status,
    (result.data?.content ?? []).filter(({ id }) => selected.has(id)).map(({ id, version }) => ({ id, version }))),
  onSuccess: async (response) => {
    setBulkSummary(`${response.succeeded} uspešno, ${response.failed} neuspešno.`)
    setSelected(new Set()); await refresh()
  } })
  const error = result.error || transition.error || bulk.error

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Operativa</p><h1>Narudžbine</h1></div></div>
    <SavedViewBar resource="ORDERS" query={url.queryObject} apply={url.apply} />
    {error && <ErrorState message={apiErrorMessage(error, 'Operaciju nad narudžbinama nije moguće izvršiti.')}
      action={<Button onClick={() => result.refetch()}>Pokušaj ponovo</Button>} />}
    <div className="filter-bar reservation-filters">
      <label>Status<select value={url.state.status} onChange={(event) => url.set({ status: event.target.value, page: '0' })}>
        <option value="">Svi</option>{['CREATED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'].map((value) =>
          <option value={value} key={value}>{value}</option>)}</select></label>
      {(user?.role === 'OWNER' || user?.role === 'ADMIN') && <label>Handler ID
        <input value={url.state.handledBy} onChange={(event) => url.set({ handledBy: event.target.value, page: '0' }, true)} placeholder="UUID zaposlenog" />
      </label>}
      <label>Od<input type="date" value={url.state.from} onChange={(event) => url.set({ from: event.target.value, page: '0' })} /></label>
      <label>Do<input type="date" value={url.state.to} onChange={(event) => url.set({ to: event.target.value, page: '0' })} /></label>
      <label>Redosled<select value={`${url.state.sort}:${url.state.direction}`} onChange={(event) => {
        const [sort, direction] = event.target.value.split(':'); url.set({ sort, direction, page: '0' })
      }}><option value="createdAt:DESC">Najnovije</option><option value="createdAt:ASC">Najstarije</option>
        <option value="totalPrice:DESC">Najveći iznos</option></select></label>
    </div>
    <SelectionBar count={selected.size} summary={bulkSummary}>
      <Button loading={bulk.isPending} onClick={() => bulk.mutate('IN_PROGRESS')}>Preuzmi izabrane</Button>
      <Button variant="danger" loading={bulk.isPending} onClick={() => bulk.mutate('CANCELLED')}>Otkaži izabrane</Button>
    </SelectionBar>
    {result.isLoading ? <Skeleton lines={6} label="Učitavanje narudžbina" /> :
      !result.data?.content.length ? <EmptyState title="Nema narudžbina" description="Promenite filtere ili period." /> :
      <section className="reservation-list">{result.data.content.map((order) => {
        const management = user?.role === 'OWNER' || user?.role === 'ADMIN'
        const own = order.handledBy === user?.id
        return <article className="panel order-row management" key={order.id}>
          <label className="row-selector"><input type="checkbox" checked={selected.has(order.id)}
            onChange={() => toggle(order.id)} aria-label={`Izaberi narudžbinu ${order.id}`} /></label>
          <div><strong>{formatBusinessDateTime(order.createdAt)}</strong><p>Kupac: {order.customerId}</p>
            <small>{order.items.length} stavki · {order.totalPrice.toFixed(2)} RSD</small></div>
          <span className="status-badge neutral">{order.status}</span>
          <div className="card-actions">
            {order.status === 'CREATED' && <><button onClick={() => transition.mutate({ order, next: 'IN_PROGRESS' })}>Preuzmi</button>
              <button className="danger-button" onClick={() => transition.mutate({ order, next: 'CANCELLED' })}>Otkaži</button></>}
            {order.status === 'IN_PROGRESS' && (own || management) && <><button onClick={() => transition.mutate({ order, next: 'READY' })}>Označi spremno</button>
              <button className="danger-button" onClick={() => transition.mutate({ order, next: 'CANCELLED' })}>Otkaži</button></>}
            {order.status === 'READY' && <>{(own || management) && <button onClick={() => transition.mutate({ order, next: 'COMPLETED' })}>Označi preuzeto</button>}
              {management && <button className="danger-button" onClick={() => transition.mutate({ order, next: 'CANCELLED' })}>Otkaži</button>}</>}
          </div>
        </article>
      })}</section>}
    <div className="pagination"><button disabled={filters.page === 0} onClick={() => url.set({ page: String(filters.page - 1) })}>Prethodna</button>
      <span>Strana {filters.page + 1} od {Math.max(result.data?.totalPages ?? 1, 1)}</span>
      <button disabled={!result.data || filters.page + 1 >= result.data.totalPages} onClick={() => url.set({ page: String(filters.page + 1) })}>Sledeća</button></div>
  </main>
}

import { useCallback, useEffect, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { orderApi } from '../api/orderApi'
import { useAuthStore } from '../auth/authStore'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { PageResponse } from '../types/api.types'
import type { Order, OrderStatus } from '../types/order.types'

export function OrdersPage() {
  const user = useAuthStore((state) => state.user)
  const [result, setResult] = useState<PageResponse<Order> | null>(null)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState<OrderStatus | ''>('CREATED')
  const [handledBy, setHandledBy] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => setResult(await orderApi.list({
    page, size: 20, status: status || undefined,
    handledBy: handledBy || undefined, from: from || undefined, to: to || undefined,
  })),
    [from, handledBy, page, status, to])

  useEffect(() => {
    void orderApi.list({
      page, size: 20, status: status || undefined,
      handledBy: handledBy || undefined, from: from || undefined, to: to || undefined,
    }).then(setResult)
      .catch((cause) => setError(apiErrorMessage(cause, 'Narudžbine nije moguće učitati.')))
  }, [from, handledBy, page, status, to])

  async function transition(order: Order, next: OrderStatus) {
    try {
      await orderApi.changeStatus(order, next)
      await load()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Status nije moguće promeniti.'))
    }
  }

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Operativa</p><h1>Narudžbine</h1></div></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="filter-bar reservation-filters">
      <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value as OrderStatus | ''); setPage(0) }}>
        <option value="">Svi</option>{['CREATED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'].map((value) =>
          <option value={value} key={value}>{value}</option>)}</select></label>
      {(user?.role === 'OWNER' || user?.role === 'ADMIN') && <label>Handler ID
        <input value={handledBy} onChange={(event) => setHandledBy(event.target.value)} placeholder="UUID zaposlenog" />
      </label>}
      <label>Od<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Do<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
    </div>
    <section className="reservation-list">
      {!result?.content.length && <p className="empty-state">Nema narudžbina.</p>}
      {result?.content.map((order) => {
        const management = user?.role === 'OWNER' || user?.role === 'ADMIN'
        const own = order.handledBy === user?.id
        return <article className="panel order-row management" key={order.id}>
          <div><strong>{formatBusinessDateTime(order.createdAt)}</strong>
            <p>Kupac: {order.customerId}</p>
            <small>{order.items.length} stavki · {order.totalPrice.toFixed(2)} RSD</small></div>
          <span className="status-badge neutral">{order.status}</span>
          <div className="card-actions">
            {order.status === 'CREATED' && <>
              <button onClick={() => void transition(order, 'IN_PROGRESS')}>Preuzmi</button>
              <button className="danger-button" onClick={() => void transition(order, 'CANCELLED')}>Otkaži</button></>}
            {order.status === 'IN_PROGRESS' && (own || management) && <>
              <button onClick={() => void transition(order, 'READY')}>Označi spremno</button>
              <button className="danger-button" onClick={() => void transition(order, 'CANCELLED')}>Otkaži</button></>}
            {order.status === 'READY' && <>
              {(own || management) && <button onClick={() => void transition(order, 'COMPLETED')}>Označi preuzeto</button>}
              {management && <button className="danger-button" onClick={() => void transition(order, 'CANCELLED')}>Otkaži</button>}
            </>}
          </div>
        </article>
      })}
    </section>
    <div className="pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Prethodna</button>
      <span>Strana {page + 1} od {Math.max(result?.totalPages ?? 1, 1)}</span>
      <button disabled={!result || page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Sledeća</button></div>
  </main>
}

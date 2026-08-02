import { useCallback, useEffect, useMemo, useState } from 'react'
import { catalogApi } from '../api/catalogApi'
import { apiErrorMessage } from '../api/client'
import { orderApi } from '../api/orderApi'
import { buildCart, calculateEstimatedTotal } from '../order/cart'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { PageResponse } from '../types/api.types'
import type { CatalogItem } from '../types/catalog.types'
import type { Order, OrderStatus } from '../types/order.types'

export function MyOrdersPage() {
  const [products, setProducts] = useState<CatalogItem[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [result, setResult] = useState<PageResponse<Order> | null>(null)
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [page, setPage] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadMine = useCallback(async () => {
    setResult(await orderApi.mine({ page, size: 20, status: status || undefined }))
  }, [page, status])

  useEffect(() => {
    void Promise.all([
      catalogApi.list({ page: 0, size: 100, type: 'PRODUCT', active: true, sort: 'name', direction: 'ASC' }),
      orderApi.mine({ page, size: 20, status: status || undefined }),
    ]).then(([productPage, orders]) => {
      setProducts(productPage.content)
      setResult(orders)
    }).catch((cause) => setError(apiErrorMessage(cause, 'Narudžbine nije moguće učitati.')))
  }, [page, status])

  const cart = useMemo(() => buildCart(products, quantities), [products, quantities])
  const estimatedTotal = calculateEstimatedTotal(cart)

  async function submit() {
    if (!cart.length) {
      setError('Dodajte najmanje jedan proizvod.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await orderApi.create({
        items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })),
      }, crypto.randomUUID())
      setQuantities({})
      setMessage('Narudžbina je uspešno poslata.')
      await loadMine()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Narudžbinu nije moguće poslati.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function cancel(order: Order) {
    try {
      await orderApi.changeStatus(order, 'CANCELLED')
      await loadMine()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Narudžbinu nije moguće otkazati.'))
    }
  }

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Pickup</p><h1>Moje narudžbine</h1></div></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {message && <p className="success-banner" role="status">{message}</p>}
    <div className="panel-grid order-grid">
      <section className="panel"><h2>Proizvodi</h2>
        {!products.length && <p className="empty-state">Trenutno nema aktivnih proizvoda.</p>}
        {products.map((product) => <label className="product-picker" key={product.id}>
          <span><strong>{product.name}</strong><small>{product.price.toFixed(2)} RSD</small></span>
          <input aria-label={`Količina za ${product.name}`} type="number" min="0" max="999" step="1"
            value={quantities[product.id] ?? 0}
            onChange={(event) => setQuantities((current) => ({
              ...current, [product.id]: Math.max(0, Number(event.target.value)),
            }))} />
        </label>)}
      </section>
      <section className="panel"><h2>Korpa</h2>
        {!cart.length && <p className="empty-state">Korpa je prazna.</p>}
        {cart.map(({ product, quantity }) => <div className="cart-line" key={product.id}>
          <span>{product.name} × {quantity}</span><strong>{(product.price * quantity).toFixed(2)} RSD</strong>
        </div>)}
        <div className="cart-total"><span>Informativno ukupno</span><strong>{estimatedTotal.toFixed(2)} RSD</strong></div>
        <p className="muted">Konačnu cenu računa server iz aktuelnog kataloga.</p>
        <button type="button" disabled={!cart.length || submitting} onClick={() => void submit()}>
          {submitting ? 'Slanje…' : 'Pošalji narudžbinu'}
        </button>
      </section>
    </div>
    <div className="list-filter"><label>Status<select value={status}
      onChange={(event) => { setStatus(event.target.value as OrderStatus | ''); setPage(0) }}>
      <option value="">Svi</option>{['CREATED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'].map((value) =>
        <option value={value} key={value}>{value}</option>)}</select></label></div>
    <section className="reservation-list">
      {!result?.content.length && <p className="empty-state">Nemate narudžbine za izabrani filter.</p>}
      {result?.content.map((order) => <article className="panel order-row" key={order.id}>
        <div><strong>{formatBusinessDateTime(order.createdAt)}</strong>
          <p>{order.items.length} stavki · {order.totalPrice.toFixed(2)} RSD</p></div>
        <span className="status-badge neutral">{order.status}</span>
        {order.status === 'CREATED' && <button className="danger-button" type="button"
          onClick={() => void cancel(order)}>Otkaži</button>}
      </article>)}
    </section>
    <div className="pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Prethodna</button>
      <span>Strana {page + 1} od {Math.max(result?.totalPages ?? 1, 1)}</span>
      <button disabled={!result || page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Sledeća</button></div>
  </main>
}

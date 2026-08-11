import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { catalogApi } from '../api/catalogApi'
import { apiErrorMessage } from '../api/client'
import { orderApi } from '../api/orderApi'
import { buildCart, calculateEstimatedTotal, CART_DRAFT_VERSION, normalizeCartQuantities, retainAvailableProducts } from '../order/cart'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { PageResponse } from '../types/api.types'
import type { CatalogItem } from '../types/catalog.types'
import type { Order, OrderStatus } from '../types/order.types'
import { IdempotencyKeyManager, isConflictResponse } from '../api/idempotency'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { deleteDraft, loadDraft, saveDraft } from '../pwa/clientStorage'

export function MyOrdersPage() {
  const [searchParams] = useSearchParams()
  const userId = useAuthStore((state) => state.user?.id)
  const [products, setProducts] = useState<CatalogItem[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [result, setResult] = useState<PageResponse<Order> | null>(null)
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [page, setPage] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [persistenceWarning, setPersistenceWarning] = useState('')
  const [cartReady, setCartReady] = useState(false)
  const [cartOwnerId, setCartOwnerId] = useState<string | null>(null)
  const [catalogReady, setCatalogReady] = useState(false)
  const createAttempt = useRef(new IdempotencyKeyManager())
  const submitInFlight = useRef(false)

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      setCartReady(false)
      setCartOwnerId(null)
      setQuantities({})
      if (!userId) setCartReady(true)
    })
    if (!userId) return () => { active = false }
    void loadDraft<Record<string, number>>(userId, 'order-cart', CART_DRAFT_VERSION)
      .then((stored) => { if (active) setQuantities((current) => ({ ...normalizeCartQuantities(stored), ...current })) })
      .catch(() => { if (active) setPersistenceWarning('Korpu nije moguće učitati sa ovog uređaja.') })
      .finally(() => { if (active) { setCartOwnerId(userId); setCartReady(true) } })
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!userId || !cartReady || cartOwnerId !== userId) return
    const persist = Object.keys(quantities).length
      ? saveDraft(userId, 'order-cart', quantities, CART_DRAFT_VERSION)
      : deleteDraft(userId, 'order-cart')
    void persist.catch(() => setPersistenceWarning('Korpu nije moguće sačuvati na ovom uređaju.'))
  }, [cartOwnerId, cartReady, quantities, userId])

  useEffect(() => {
    if (!cartReady || !catalogReady) return
    const available = retainAvailableProducts(quantities, new Set(products.map(({ id }) => id)))
    if (Object.keys(available).length !== Object.keys(quantities).length) {
      void Promise.resolve().then(() => {
        setPersistenceWarning('Nedostupni proizvodi su uklonjeni iz korpe.')
        setQuantities(available)
      })
    }
  }, [cartReady, catalogReady, products, quantities])

  const loadMine = useCallback(async () => {
    setResult(await orderApi.mine({ page, size: 20, status: status || undefined }))
  }, [page, status])

  useEffect(() => {
    void Promise.all([
      catalogApi.list({ page: 0, size: 100, type: 'PRODUCT', active: true, sort: 'name', direction: 'ASC' }),
      orderApi.mine({ page, size: 20, status: status || undefined }),
    ]).then(([productPage, orders]) => {
      setProducts(productPage.content)
      setCatalogReady(true)
      const selectedProduct = searchParams.get('productId') ?? sessionStorage.getItem('gmanager.catalog-selection')
      if (selectedProduct && productPage.content.some(({ id }) => id === selectedProduct)) {
        setQuantities((current) => ({ ...current, [selectedProduct]: Math.max(1, current[selectedProduct] ?? 0) }))
        sessionStorage.removeItem('gmanager.catalog-selection')
      }
      setResult(orders)
    }).catch((cause) => setError(apiErrorMessage(cause, 'Narudžbine nije moguće učitati.')))
  }, [page, searchParams, status])

  const cart = useMemo(() => buildCart(products, quantities), [products, quantities])
  const estimatedTotal = calculateEstimatedTotal(cart)

  async function submit() {
    if (submitInFlight.current) return
    if (!cart.length) {
      setError('Dodajte najmanje jedan proizvod.')
      return
    }
    setSubmitting(true)
    submitInFlight.current = true
    setError('')
    try {
      const created = await orderApi.create({
        items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })),
      }, createAttempt.current.begin())
      createAttempt.current.succeeded()
      setQuantities({})
      await loadMine()
      setMessage(`Narudžbina je poslata. Server je potvrdio ukupno ${created.totalPrice.toFixed(2)} RSD.`)
    } catch (cause) {
      createAttempt.current.failed(cause)
      setError(isConflictResponse(cause)
        ? 'Podaci su promenjeni. Osvežite prikaz pre novog pokušaja.'
        : apiErrorMessage(cause, 'Narudžbinu nije moguće poslati. Isti zahtev možete pokušati ponovo.'))
    } finally {
      submitInFlight.current = false
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
    {persistenceWarning && <p className="warning-banner" role="status">{persistenceWarning}</p>}
    <div className="panel-grid order-grid">
      <section className="panel"><h2>Proizvodi</h2>
        {!products.length && <p className="empty-state">Trenutno nema aktivnih proizvoda.</p>}
        {products.map((product) => <label className="product-picker" key={product.id}>
          <span><strong>{product.name}</strong><small>{product.price.toFixed(2)} RSD</small></span>
          <input aria-label={`Količina za ${product.name}`} type="number" min="0" max="999" step="1"
            value={quantities[product.id] ?? 0}
            onChange={(event) => setQuantities((current) => ({
              ...current, [product.id]: Math.min(999, Math.max(0, Math.trunc(Number(event.target.value)))),
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

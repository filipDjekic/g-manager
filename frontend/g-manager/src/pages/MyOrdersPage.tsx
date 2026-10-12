import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { catalogApi, type CatalogFilters } from '../api/catalogApi'
import { orderApi } from '../api/orderApi'
import { isConflictResponse } from '../api/idempotency'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, Drawer, EmptyState, ErrorState, Input, Modal, Select, Skeleton } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { CatalogPagination } from '../catalog/CatalogPagination'
import { OrdersPagination } from '../order/OrdersPagination'
import { itemCountLabel, OrderIcon, orderErrorMessage, orderMoney, shortOrderId } from '../order/orderPresentation'
import {
  CustomerCartContents, CustomerOrderHistory, CustomerOrderPanel, CustomerOrderTracking, CustomerProductCard, ShoppingBagIcon,
} from '../order/customer/CustomerOrderComponents'
import { useCustomerCart } from '../order/customer/useCustomerCart'
import { calculateEstimatedTotal, type CartLine } from '../order/cart'
import type { AuthUser } from '../types/auth.types'
import type { Order, OrderStatus } from '../types/order.types'
import '../order/customer/customerOrders.css'

const statuses: OrderStatus[] = ['CREATED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED']
const productSorts = {
  NAME_ASC: { sort: 'name', direction: 'ASC' }, NAME_DESC: { sort: 'name', direction: 'DESC' },
  PRICE_ASC: { sort: 'price', direction: 'ASC' }, PRICE_DESC: { sort: 'price', direction: 'DESC' },
} as const
const emptyFilters = { search: '', minPrice: undefined, maxPrice: undefined, ...productSorts.NAME_ASC }

export function MyOrdersPage() {
  const user = useAuthStore(state => state.user)
  if (!user || user.role !== 'CUSTOMER' || !hasCapability(user, 'ORDER_READ_OWN')) return <main className="workspace gm-my-orders">
    <EmptyState title="Moje narudžbine nisu dostupne" description="Ovaj pregled zahteva dozvolu za sopstvene narudžbine." />
  </main>
  // A different account receives a fresh workspace before any old cart can be rendered.
  return <CustomerOrdersWorkspace key={user.id} user={user} />
}

function CustomerOrdersWorkspace({ user }: { user: AuthUser }) {
  const client = useQueryClient(), { confirm, confirmationDialog } = useConfirmDialog()
  const canCatalog = hasCapability(user, 'CATALOG_READ'), canCreate = hasCapability(user, 'ORDER_CREATE')
  const cart = useCustomerCart(user.id, canCatalog)
  const [params, setParams] = useSearchParams()
  const rawStatus = params.get('status') ?? '', status = statuses.includes(rawStatus as OrderStatus) ? rawStatus as OrderStatus : ''
  const rawPage = Number(params.get('page') ?? '1'), page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage - 1 : 0
  const requestedSize = Number(params.get('size') ?? '10'), historySize = [10, 20, 50].includes(requestedSize) ? requestedSize : 10
  const selectedId = params.get('orderId')
  const [search, setSearch] = useState(''), [minPrice, setMinPrice] = useState(''), [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<keyof typeof productSorts>('NAME_ASC')
  const [filters, setFilters] = useState<Pick<CatalogFilters, 'search' | 'minPrice' | 'maxPrice' | 'sort' | 'direction'>>(emptyFilters)
  const [productPage, setProductPage] = useState(0), [productSize, setProductSize] = useState(9)
  const [cartOpen, setCartOpen] = useState(false), [checkout, setCheckout] = useState<CartLine[] | null>(null)
  const [checkoutError, setCheckoutError] = useState(''), [cancelling, setCancelling] = useState(''), [message, setMessage] = useState('')
  const [selectionWarning, setSelectionWarning] = useState('')
  const [storedSelection, setStoredSelection] = useState(() => { try { return sessionStorage.getItem('gmanager.catalog-selection') } catch { return null } })
  const linkedProduct = params.get('productId') ?? storedSelection
  const consumedSelection = useRef('')
  const titleRef = useRef<HTMLHeadingElement>(null), catalogRef = useRef<HTMLHeadingElement>(null), trackingRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null), cartOpener = useRef<HTMLElement | null>(null), checkoutOpener = useRef<HTMLElement | null>(null)
  const checkoutCancel = useRef<HTMLButtonElement>(null)
  const pricesValid = [minPrice, maxPrice].every(value => !value || Number.isFinite(Number(value)) && Number(value) >= 0)
    && (!minPrice || !maxPrice || Number(minPrice) <= Number(maxPrice))
  const quantityCount = Object.values(cart.quantities).reduce((sum, quantity) => sum + quantity, 0)
  const cartLocked = Boolean(checkout) || cart.submitting
  const changeParams = (changes: Record<string, string | undefined>, replace = false) => setParams(current => {
    const next = new URLSearchParams(current)
    Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key) })
    return next
  }, { replace })

  useEffect(() => {
    if (!pricesValid) return
    const timer = window.setTimeout(() => {
      setFilters({ search: search.trim(), minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined, ...productSorts[sort] })
      setProductPage(0)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search, minPrice, maxPrice, sort, pricesValid])

  const catalog = useQuery({ queryKey: ['catalog', 'customer-products', user.id, filters, productPage, productSize],
    queryFn: () => catalogApi.list({ page: productPage, size: productSize, type: 'PRODUCT', active: true, ...filters }),
    enabled: canCatalog && pricesValid, staleTime: 30000, refetchInterval: 60000, refetchIntervalInBackground: false })
  const orders = useQuery({ queryKey: ['orders', 'mine', user.id, 'customer-history', status, page, historySize],
    queryFn: () => orderApi.mine({ page, size: historySize, status: status || undefined, sort: 'createdAt', direction: 'DESC' }),
    staleTime: 5000, refetchInterval: 15000, refetchIntervalInBackground: false })
  const detail = useQuery({ queryKey: ['orders', 'mine-detail', user.id, selectedId],
    queryFn: () => orderApi.mineDetail(selectedId!), enabled: Boolean(selectedId), staleTime: 5000,
    refetchInterval: 15000, refetchIntervalInBackground: false, retry: false })
  const selection = useQuery({ queryKey: ['catalog', 'customer-product', user.id, linkedProduct],
    queryFn: () => catalogApi.get(linkedProduct!), enabled: Boolean(linkedProduct) && canCatalog && canCreate && cart.ready && !cart.attempt,
    staleTime: 30000, retry: false })

  useEffect(() => {
    if (orders.isSuccess && !selectedId && orders.data.content[0]) changeParams({ orderId: orders.data.content[0].id }, true)
  }, [orders.isSuccess, orders.data, selectedId])
  useEffect(() => {
    if (!canCreate || !canCatalog || !cart.ready || cart.attempt || !linkedProduct || !selection.isSuccess || consumedSelection.current === linkedProduct) return
    const product = selection.data
    if (!product.active || product.deletedAt || product.type !== 'PRODUCT') {
      setSelectionWarning('Izabrani proizvod nije dostupan za naručivanje.'); return
    }
    consumedSelection.current = linkedProduct
    cart.add(product, true)
    try { if (sessionStorage.getItem('gmanager.catalog-selection') === linkedProduct) sessionStorage.removeItem('gmanager.catalog-selection') }
    catch { setSelectionWarning('Izbor iz kataloga nije moguće obrisati iz memorije pregledača.') }
    setStoredSelection(null)
    if (params.has('productId')) changeParams({ productId: undefined }, true)
  }, [linkedProduct, selection.data, selection.isSuccess, canCreate, canCatalog, cart.ready, cart.attempt])
  useEffect(() => {
    if (catalog.isSuccess && catalog.data.totalPages > 0 && productPage >= catalog.data.totalPages) setProductPage(catalog.data.totalPages - 1)
  }, [catalog.data, catalog.isSuccess, productPage])
  useEffect(() => {
    if (orders.isSuccess && page > 0 && page >= Math.max(1, orders.data.totalPages)) changeParams({ page: String(Math.max(1, orders.data.totalPages)) }, true)
  }, [orders.data, orders.isSuccess, page])

  const canCancel = (order: Order) => order.customerId === user.id && order.status === 'CREATED' && hasCapability(user, 'ORDER_CHANGE_STATUS')
  function browse() {
    setCartOpen(false)
    window.requestAnimationFrame(() => { catalogRef.current?.scrollIntoView({ block: 'start' }); searchRef.current?.focus({ preventScroll: true }) })
  }
  function resetFilters() { setSearch(''); setMinPrice(''); setMaxPrice(''); setSort('NAME_ASC'); setFilters(emptyFilters); setProductPage(0) }
  function openCheckout(element: HTMLElement) {
    if (!canCreate || !cart.ready || cart.submitting || !cart.ids.length || !cart.attempt && cart.unresolved.length) return
    checkoutOpener.current = element; setCheckoutError(''); setCheckout([...cart.cart])
  }
  function closeCheckout() { if (!cart.submitting) { setCheckout(null); setCheckoutError('') } }
  async function refreshOrders() {
    await Promise.all([client.invalidateQueries({ queryKey: ['orders', 'mine'] }), client.invalidateQueries({ queryKey: ['orders', 'mine-detail', user.id] })])
  }
  async function submit() {
    if (!checkout || cart.submitting) return
    try {
      const created = await cart.send(checkout)
      if (!created || useAuthStore.getState().user?.id !== user.id) return
      setMessage(`Narudžbina je uspešno poslata. Potvrđeno ukupno: ${orderMoney.format(created.totalPrice)}.`)
      setCheckout(null); setCartOpen(false); setCheckoutError('')
      changeParams({ orderId: created.id, status: undefined, page: undefined })
      void refreshOrders()
      window.requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }))
    } catch (cause) { setCheckoutError(orderErrorMessage(cause, 'Narudžbinu nije moguće poslati.')) }
  }
  function cancel(order: Order) {
    if (!canCancel(order) || cancelling) return
    let conflict = false
    confirm({ title: 'Otkaži narudžbinu', titleIcon: <OrderIcon kind="cancel" />, className: 'gm-my-order-dialog',
      description: <>Narudžbina <strong>{shortOrderId(order.id)}</strong> sa iznosom {orderMoney.format(order.totalPrice)} biće otkazana.</>,
      variant: 'danger', confirmLabel: 'Otkaži narudžbinu', errorMessage: 'Narudžbinu nije moguće otkazati.',
      formatError: cause => orderErrorMessage(cause, 'Narudžbinu nije moguće otkazati.'), onConfirm: async () => {
        const actor = useAuthStore.getState().user
        if (conflict) throw new Error('Narudžbina je promenjena. Zatvorite potvrdu i pregledajte osvežen status pre nove akcije.')
        if (actor?.id !== user.id || !hasCapability(actor, 'ORDER_CHANGE_STATUS') || order.customerId !== actor.id) throw new Error('Otkazivanje nije dostupno sa trenutnim dozvolama.')
        setCancelling(order.id)
        try {
          await orderApi.changeStatus(order, 'CANCELLED')
          if (useAuthStore.getState().user?.id === user.id) {
            setMessage('Narudžbina je otkazana.'); await refreshOrders()
            window.requestAnimationFrame(() => trackingRef.current?.focus({ preventScroll: true }))
          }
        } catch (cause) {
          conflict = isConflictResponse(cause)
          if (useAuthStore.getState().user?.id === user.id) await refreshOrders()
          throw cause
        } finally { setCancelling('') }
      } })
  }
  function clearCart() {
    if (cartLocked || cart.attempt || !cart.ids.length) return
    confirm({ title: 'Obriši korpu', titleIcon: <OrderIcon />, className: 'gm-my-order-dialog',
      description: 'Svi proizvodi biće uklonjeni iz korpe.', variant: 'warning', confirmLabel: 'Obriši sve', onConfirm: () => {
        cart.clear()
        if (!cartOpen) window.requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }))
      } })
  }
  const cartContents = <CustomerCartContents cart={cart} canCreate={canCreate} locked={cartLocked} onClear={clearCart} onCheckout={openCheckout} onBrowse={browse} />
  const checkoutItems = cart.attempt?.items ?? checkout?.map(({ product, quantity }) => ({ productId: product.id, quantity })) ?? []
  const checkoutEstimate = cart.attempt?.estimatedTotal ?? calculateEstimatedTotal(checkout ?? [])

  return <main className="workspace gm-my-orders">
    {confirmationDialog}
    <header className="gm-my-orders-heading"><div><span className="gm-my-shopping-icon"><ShoppingBagIcon /></span><div>
      <h1 ref={titleRef} tabIndex={-1}>Moje narudžbine</h1><p>Katalog proizvoda, korpa i praćenje statusa porudžbina.</p>
    </div></div><Button type="button" variant="secondary" onClick={() => { void orders.refetch(); if (selectedId) void detail.refetch(); if (canCatalog && pricesValid) void catalog.refetch(); void cart.retryProducts() }}>
      <OrderIcon kind="refresh" />Osveži pregled</Button></header>
    {message && <p className="success-banner gm-my-order-message" role="status">{message}<Button type="button" variant="secondary" onClick={() => setMessage('')} aria-label="Zatvori potvrdu">×</Button></p>}
    {cart.warning && cart.ready && <p className="warning-banner" role="status">{cart.warning}</p>}
    {cart.notice && <p className="gm-my-order-notice" role="status">{cart.notice}</p>}
    {selectionWarning && <p className="warning-banner" role="status">{selectionWarning}</p>}
    {selection.isError && canCreate && canCatalog && linkedProduct && <ErrorState message={orderErrorMessage(selection.error, 'Izabrani proizvod nije moguće učitati.')}
      action={<Button type="button" variant="secondary" onClick={() => void selection.refetch()}>Pokušaj ponovo</Button>} />}

    <div className="gm-my-shop-grid">
      <CustomerOrderPanel title="Katalog proizvoda" icon={<ShoppingBagIcon />} className="gm-my-catalog-panel"
        actions={<Badge tone="info">Svi proizvodi</Badge>}>
        <div className="gm-my-product-filters">
          <label className="gm-my-product-search"><span>Pretraga proizvoda</span><div><OrderIcon kind="search" /><Input ref={searchRef} type="search" value={search} maxLength={200}
            placeholder="Pretraži proizvode..." disabled={!canCatalog} onChange={event => setSearch(event.target.value)} /></div></label>
          <label><span>Sortiranje</span><Select value={sort} disabled={!canCatalog} onChange={event => setSort(event.target.value as keyof typeof productSorts)}>
            <option value="NAME_ASC">Naziv: A–Ž</option><option value="NAME_DESC">Naziv: Ž–A</option>
            <option value="PRICE_ASC">Cena: rastuće</option><option value="PRICE_DESC">Cena: opadajuće</option></Select></label>
          <label><span>Cena od (RSD)</span><Input type="number" inputMode="decimal" min={0} step="0.01" value={minPrice} disabled={!canCatalog} onChange={event => setMinPrice(event.target.value)} aria-invalid={!pricesValid || undefined} /></label>
          <label><span>Cena do (RSD)</span><Input type="number" inputMode="decimal" min={0} step="0.01" value={maxPrice} disabled={!canCatalog} onChange={event => setMaxPrice(event.target.value)} aria-invalid={!pricesValid || undefined} /></label>
        </div>
        <h3 ref={catalogRef} tabIndex={-1} className="sr-only">Dostupni proizvodi</h3>
        {!canCatalog ? <EmptyState title="Katalog nije dostupan" description="Pregled proizvoda zahteva odgovarajuću dozvolu." />
          : !pricesValid ? <ErrorState message="Unesite nenegativne cene, pri čemu cena od nije veća od cene do." action={<Button type="button" variant="secondary" onClick={resetFilters}>Ukloni filtere</Button>} />
            : catalog.isLoading ? <div className="gm-my-product-grid">{Array.from({ length: 6 }, (_, index) => <div className="gm-my-product-card" key={index}><Skeleton lines={5} label="Učitavanje proizvoda" /></div>)}</div>
              : catalog.isError ? <ErrorState message={orderErrorMessage(catalog.error, 'Katalog proizvoda nije moguće učitati.')} action={<Button type="button" onClick={() => void catalog.refetch()}>Pokušaj ponovo</Button>} />
                : !catalog.data?.content.length ? <EmptyState title="Trenutno nema dostupnih proizvoda." description="Proverite pretragu ili raspon cena."
                  action={<Button type="button" variant="secondary" onClick={resetFilters}>Ukloni filtere</Button>} />
                  : <div className="gm-my-product-grid">{catalog.data.content.filter(product => product.active && !product.deletedAt && product.type === 'PRODUCT')
                    .map(product => <CustomerProductCard key={product.id} product={product} count={cart.quantities[product.id] ?? 0}
                      disabled={!canCreate || !cart.ready || cartLocked || Boolean(cart.attempt)} onAdd={() => cart.add(product)} />)}</div>}
        {canCatalog && pricesValid && catalog.isSuccess && <CatalogPagination page={productPage} size={productSize} totalPages={catalog.data.totalPages}
          totalElements={catalog.data.totalElements} loading={catalog.isFetching} onPageChange={setProductPage}
          onSizeChange={size => { setProductSize(size); setProductPage(0) }} />}
      </CustomerOrderPanel>
      <CustomerOrderPanel title="Korpa" icon={<OrderIcon />} className="gm-my-cart-panel">{cartContents}</CustomerOrderPanel>
    </div>

    <Button ref={element => { if (element) cartOpener.current = element }} type="button" className="gm-my-mobile-cart" variant="secondary"
      onClick={event => { cartOpener.current = event.currentTarget; setCartOpen(true) }} aria-haspopup="dialog" aria-expanded={cartOpen}>
      <OrderIcon /><span>Korpa <strong>{cart.ready ? quantityCount : '—'}</strong></span><strong>{cart.ready && cart.estimatedTotal !== null ? orderMoney.format(cart.estimatedTotal) : '—'}</strong>
    </Button>

    <div className="gm-my-orders-lower-grid">
      <CustomerOrderPanel title="Pregled mojih narudžbina" icon={<OrderIcon />} className="gm-my-history-panel">
        <div className="gm-my-order-status-filters" role="group" aria-label="Filter statusa narudžbina">
          {[{ value: '', label: 'Sve narudžbine' }, ...statuses.map(value => ({ value, label: value === 'READY' ? 'Spremne' : value === 'CREATED' ? 'Primljene'
            : value === 'IN_PROGRESS' ? 'U pripremi' : value === 'COMPLETED' ? 'Završene' : 'Otkazane' }))].map(option => <Button key={option.value} type="button" variant="secondary"
              aria-pressed={status === option.value} onClick={() => changeParams({ status: option.value || undefined, page: undefined })}>{option.label}</Button>)}
        </div>
        {orders.isLoading ? <Skeleton lines={6} label="Učitavanje narudžbina" /> : orders.isError
          ? <ErrorState message={orderErrorMessage(orders.error, 'Istoriju narudžbina nije moguće učitati.')} action={<Button type="button" onClick={() => void orders.refetch()}>Pokušaj ponovo</Button>} />
          : !orders.data?.content.length ? <EmptyState title={status ? 'Nemate narudžbine za izabrani status.' : 'Još nemate narudžbine.'}
            action={<Button type="button" variant="secondary" onClick={status ? () => changeParams({ status: undefined, page: undefined }) : browse}>{status ? 'Sve narudžbine' : 'Pregledaj proizvode'}</Button>} />
            : <CustomerOrderHistory orders={orders.data.content} selectedId={selectedId} canCancel={canCancel} cancelling={cancelling}
              onCancel={cancel} onSelect={(order) => { changeParams({ orderId: order.id }); window.requestAnimationFrame(() => { trackingRef.current?.scrollIntoView({ block: 'nearest' }); trackingRef.current?.focus({ preventScroll: true }) }) }} />}
        {orders.isSuccess && <OrdersPagination page={page} size={historySize} totalPages={orders.data.totalPages} totalElements={orders.data.totalElements} busy={orders.isFetching}
          onPage={next => changeParams({ page: next ? String(next + 1) : undefined })}
          onSize={size => changeParams({ size: size === 10 ? undefined : String(size), page: undefined })} />}
      </CustomerOrderPanel>
      <div ref={trackingRef} tabIndex={-1} className="gm-my-tracking-region" role="region" aria-label="Praćenje izabrane narudžbine">
        <CustomerOrderPanel title="Praćenje narudžbine" icon={<OrderIcon kind="clock" />} className="gm-my-tracking-panel">
          {!selectedId ? <EmptyState title="Izaberite narudžbinu" description="Izaberite „Prikaži“ da vidite status i stavke narudžbine." />
            : detail.isLoading ? <Skeleton lines={6} label="Učitavanje detalja narudžbine" /> : detail.isError
              ? <ErrorState message={orderErrorMessage(detail.error, 'Detalje narudžbine nije moguće učitati.')} action={<Button type="button" onClick={() => void detail.refetch()}>Pokušaj ponovo</Button>} />
              : detail.data && <CustomerOrderTracking order={detail.data} canCancel={canCancel(detail.data)} cancelling={cancelling === detail.data.id}
                onCancel={() => { if (detail.data) cancel(detail.data) }} onRefresh={() => void detail.refetch()} />}
        </CustomerOrderPanel>
      </div>
    </div>

    <Drawer open={cartOpen} title="Korpa" size="wide" className="gm-my-cart-drawer" closeDisabled={cart.submitting} returnFocusRef={cartOpener} onClose={() => setCartOpen(false)}>
      {cartContents}
    </Drawer>
    <Modal open={Boolean(checkout)} title={cart.attempt ? 'Provera prethodnog slanja' : 'Potvrda narudžbine'} titleIcon={<ShoppingBagIcon />} className="gm-my-order-dialog gm-my-checkout-dialog"
      returnFocusRef={checkoutOpener} initialFocusRef={checkoutCancel} onClose={closeCheckout} closeDisabled={cart.submitting}
      footer={<div className="dialog-actions"><Button ref={checkoutCancel} type="button" variant="secondary" disabled={cart.submitting} onClick={closeCheckout}>Zatvori</Button>
        <Button type="button" className="gm-my-submit-order" disabled={!canCreate || !checkoutItems.length} loading={cart.submitting} onClick={() => void submit()}>
          {cart.attempt ? 'Ponovi isti zahtev' : 'Potvrdi slanje'}</Button></div>}>
      <p className="gm-my-order-note">{cart.attempt ? 'Ponovni pokušaj proverava iste proizvode i količine uz zaštitu od duplog slanja.' : 'Pregledajte proizvode i količine pre slanja.'}</p>
      <ul className="gm-my-checkout-items">{checkoutItems.map(item => <li key={item.productId}>
        <span>{checkout?.find(line => line.product.id === item.productId)?.product.name ?? `Proizvod ${shortOrderId(item.productId)}`}</span><strong>{item.quantity} kom</strong>
      </li>)}</ul>
      <div className="gm-my-cart-total"><span>Informativno ukupno</span><strong>{orderMoney.format(checkoutEstimate)}</strong></div>
      <p className="gm-my-order-note">Server potvrđuje konačne cene. {itemCountLabel(checkoutItems.length)}.</p>
      {checkoutError && <p className="error-banner" role="alert">{checkoutError}</p>}
    </Modal>
  </main>
}

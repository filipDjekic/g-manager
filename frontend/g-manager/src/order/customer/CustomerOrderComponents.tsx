import { useId, type ReactNode } from 'react'
import { Badge, Button, EmptyState, ErrorState, Input, Skeleton } from '../../components/ui'
import { orderLabels, orderTones } from '../../components/ui/statusPresentation'
import { CatalogImage } from '../../catalog/CatalogImage'
import { formatBusinessDateTime } from '../../reservations/dateTime'
import type { CatalogItem } from '../../types/catalog.types'
import type { CustomerOrderDetail, Order, OrderStatus } from '../../types/order.types'
import { itemCountLabel, orderMoney, orderQuantity, shortOrderId } from '../orderPresentation'
import type { useCustomerCart } from './useCustomerCart'

export function ShoppingBagIcon() {
  return <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 7h14l1 14H4L5 7Z M8 8V6a4 4 0 0 1 8 0v2" /></svg>
}

export function CustomerProductImage({ name, imageUrl, thumbnail = false }: {
  name: string; imageUrl: string | null; thumbnail?: boolean
}) {
  return <div className={thumbnail ? 'gm-my-product-thumbnail' : 'gm-my-product-image'}>
    <CatalogImage key={imageUrl} item={{ type: 'PRODUCT', imageUrl }} authenticatedPreview alt={name} />
  </div>
}

export function CustomerOrderPanel({ title, icon, actions, children, className = '' }: {
  title: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string
}) {
  const id = useId()
  return <section className={`ui-card gm-my-order-panel ${className}`} aria-labelledby={id}>
    <header className="gm-my-order-panel-heading">{icon && <span className="gm-my-order-panel-icon">{icon}</span>}<h2 id={id}>{title}</h2>{actions}</header>
    {children}
  </section>
}

export function CustomerProductCard({ product, count, disabled, onAdd }: {
  product: CatalogItem; count: number; disabled: boolean; onAdd: () => void
}) {
  return <article className="gm-my-product-card">
    <CustomerProductImage name={product.name} imageUrl={product.imageUrl} />
    <div className="gm-my-product-content"><h3>{product.name}</h3>
      <p className="gm-my-product-description">{product.description || 'Opis proizvoda nije dostupan.'}</p>
      <strong className="gm-my-product-price">{orderMoney.format(product.price)}</strong>
      <Button type="button" disabled={disabled || count >= 999} aria-label={`Dodaj ${product.name} u korpu`} onClick={onAdd}>+ Dodaj</Button>
      {count > 0 && <small>{count} u korpi{count >= 999 && ' · dostignut maksimum'}</small>}
    </div>
  </article>
}

export function CustomerCartContents({ cart, canCreate, locked, onClear, onCheckout, onBrowse }: {
  cart: ReturnType<typeof useCustomerCart>; canCreate: boolean; locked: boolean
  onClear: () => void; onCheckout: (element: HTMLElement) => void; onBrowse: () => void
}) {
  const disabled = locked || Boolean(cart.attempt) || cart.submitting
  if (!cart.ready) return <div className="gm-my-cart-content">{cart.warning
    ? <ErrorState message={cart.warning} action={<Button type="button" variant="secondary" onClick={cart.retryDraft}>Ponovo učitaj korpu</Button>} />
    : <Skeleton lines={5} label="Učitavanje sačuvane korpe" />}</div>
  return <div className="gm-my-cart-content">
    {cart.ids.length > 0 && <Button className="gm-my-clear-cart" type="button" variant="secondary" disabled={disabled} onClick={onClear}>Obriši sve</Button>}
    {!cart.ids.length && <EmptyState title="Vaša korpa je prazna." description="Dodajte proizvod iz kataloga."
      action={<Button type="button" variant="secondary" onClick={onBrowse}>Pregledaj proizvode</Button>} />}
    <ul className="gm-my-cart-lines">{cart.ids.map((id, index) => {
      const product = cart.cart.find(line => line.product.id === id)?.product, quantity = cart.quantities[id]
      return <li key={id}>
        <CustomerProductImage name={product?.name ?? `Proizvod ${shortOrderId(id)}`} imageUrl={product?.imageUrl ?? null} thumbnail />
        <div className="gm-my-cart-item-info"><strong>{product?.name ?? `Proizvod ${shortOrderId(id)}`}</strong>
          <small>{product ? `${orderMoney.format(product.price)} / kom` : cart.products[index]?.isFetching ? 'Učitavanje proizvoda…' : 'Podaci o proizvodu nisu dostupni.'}</small>
          {!product && cart.canCatalog && !cart.products[index]?.isFetching && <Button type="button" variant="secondary" onClick={() => void cart.products[index]?.refetch()}>Ponovo učitaj</Button>}
        </div>
        <Button className="gm-my-remove-cart-item" type="button" variant="secondary" disabled={disabled} aria-label={`Ukloni ${product?.name ?? shortOrderId(id)} iz korpe`} onClick={() => cart.change(id, 0)}>×</Button>
        <div className="gm-my-cart-line-controls">
          <div className="gm-my-quantity-control"><Button type="button" variant="secondary" disabled={disabled} aria-label={`Smanji količinu za ${product?.name ?? shortOrderId(id)}`} onClick={() => cart.change(id, quantity - 1)}>−</Button>
            <Input type="number" min={1} max={999} step={1} inputMode="numeric" value={quantity} disabled={disabled}
              aria-label={`Količina za ${product?.name ?? shortOrderId(id)}`} onChange={event => { if (event.target.value !== '') cart.change(id, Number(event.target.value)) }} />
            <Button type="button" variant="secondary" disabled={disabled || quantity >= 999} aria-label={`Povećaj količinu za ${product?.name ?? shortOrderId(id)}`} onClick={() => cart.change(id, quantity + 1)}>+</Button></div>
          <strong className="gm-my-cart-line-total">{product ? orderMoney.format(product.price * quantity) : '—'}</strong>
        </div>
      </li>
    })}</ul>
    <div className="gm-my-cart-total"><span>Ukupno</span><strong>{cart.estimatedTotal === null ? '—' : orderMoney.format(cart.estimatedTotal)}</strong></div>
    <p className="gm-my-order-note">Informativan obračun. Konačan iznos potvrđuje server prilikom slanja.</p>
    {cart.unresolved.length > 0 && <p className="gm-my-order-notice" role="status">Proizvodi ostaju u korpi dok se ne potvrdi njihova dostupnost i cena.</p>}
    {cart.attempt && <p className="gm-my-order-notice" role="status">Korpa čeka potvrdu prethodnog slanja. Ponovni pokušaj koristi iste stavke.</p>}
    {cart.submitError && <p className="error-banner" role="alert">{cart.submitError}</p>}
    <Button className="gm-my-submit-order" type="button" loading={cart.submitting} disabled={!canCreate || !cart.ids.length || locked || !cart.attempt && cart.unresolved.length > 0}
      onClick={event => onCheckout(event.currentTarget)}>{cart.attempt ? 'Proveri prethodno slanje' : 'Pošalji narudžbinu'}</Button>
    {!canCreate && <p className="gm-my-order-note">Naručivanje nije dostupno sa trenutnim dozvolama.</p>}
  </div>
}

const progressSteps: Array<Exclude<OrderStatus, 'CANCELLED'>> = ['CREATED', 'IN_PROGRESS', 'READY', 'COMPLETED']
export function CustomerOrderProgress({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') return <p className="gm-my-order-cancelled" role="status">Narudžbina je otkazana. Priprema i preuzimanje se ne nastavljaju.</p>
  const current = progressSteps.indexOf(status)
  return <ol className="gm-my-order-progress" aria-label="Napredak narudžbine">{progressSteps.map((step, index) => {
    const done = index < current || status === 'COMPLETED' || index === 0
    return <li key={step} className={index === current && status !== 'COMPLETED' ? 'is-current' : done ? 'is-done' : 'is-future'} aria-current={index === current ? 'step' : undefined}>
      <span aria-hidden="true">{done ? '✓' : index + 1}</span><strong>{orderLabels[step]}</strong>
      <span className="sr-only">{index === current ? 'Trenutni status' : done ? 'Dostignut korak' : 'Budući korak'}</span>
    </li>
  })}</ol>
}

export function CustomerOrderTracking({ order, canCancel, cancelling, onCancel, onRefresh }: {
  order: CustomerOrderDetail; canCancel: boolean; cancelling: boolean; onCancel: () => void; onRefresh: () => void
}) {
  return <div className="gm-my-order-tracking">
    <div className="gm-my-selected-order-heading"><strong>{shortOrderId(order.id)}</strong><Badge tone={orderTones[order.status]}>{orderLabels[order.status]}</Badge></div>
    <details className="gm-my-full-order-id"><summary>Prikaži puni identifikator</summary><code>{order.id}</code></details>
    <p className="gm-my-order-note">Kreirana <time dateTime={order.createdAt}>{formatBusinessDateTime(order.createdAt, false, 'sr-Latn-RS')}</time></p>
    <CustomerOrderProgress status={order.status} />
    <h3>Stavke narudžbine</h3>
    <ul className="gm-my-order-detail-items">{order.items.map(item => <li key={item.productId}>
      <CustomerProductImage name={item.productName ?? `Proizvod ${shortOrderId(item.productId)}`} imageUrl={item.productImageUrl} thumbnail />
      <div><strong>{item.productName ?? `Proizvod ${shortOrderId(item.productId)}`}</strong>
        <small>{item.quantity} × {orderMoney.format(item.unitPrice)}</small>
        {!item.productName && <small>Naziv nije dostupan u trenutnom katalogu.</small>}</div><strong>{orderMoney.format(item.lineTotal)}</strong>
    </li>)}</ul>
    <div className="gm-my-cart-total"><span>Ukupno</span><strong>{orderMoney.format(order.totalPrice)}</strong></div>
    <p className="gm-my-order-note">Iznosi su sačuvani prilikom kreiranja narudžbine.</p>
    <div className="gm-my-order-detail-actions"><Button type="button" variant="secondary" onClick={onRefresh}>Osveži status</Button>
      {canCancel && <Button type="button" variant="danger" loading={cancelling} onClick={onCancel}>Otkaži narudžbinu</Button>}</div>
  </div>
}

export function CustomerOrderHistory({ orders, selectedId, canCancel, cancelling, onSelect, onCancel }: {
  orders: Order[]; selectedId: string | null; canCancel: (order: Order) => boolean; cancelling: string
  onSelect: (order: Order, element: HTMLElement) => void; onCancel: (order: Order) => void
}) {
  return <div className="gm-my-order-table-shell"><table className="gm-my-order-table"><thead><tr>
    <th>Narudžbina</th><th>Datum</th><th>Stavke</th><th>Ukupan iznos</th><th>Status</th><th>Akcije</th>
  </tr></thead><tbody>{orders.map(order => <tr key={order.id} className={selectedId === order.id ? 'is-selected' : undefined}>
    <td data-label="Narudžbina"><span title={order.id}>{shortOrderId(order.id)}</span></td>
    <td data-label="Datum"><time dateTime={order.createdAt}>{formatBusinessDateTime(order.createdAt, false, 'sr-Latn-RS')}</time></td>
    <td data-label="Stavke"><span>{itemCountLabel(order.items.length)}<small>{orderQuantity(order)} kom</small></span></td>
    <td data-label="Ukupno"><strong>{orderMoney.format(order.totalPrice)}</strong></td>
    <td data-label="Status"><Badge tone={orderTones[order.status]}>{orderLabels[order.status]}</Badge></td>
    <td data-label="Akcije"><div className="gm-my-history-actions"><Button type="button" variant="secondary" aria-pressed={selectedId === order.id}
      aria-label={`Prikaži narudžbinu ${shortOrderId(order.id)}`} onClick={event => onSelect(order, event.currentTarget)}>Prikaži</Button>
      {canCancel(order) && <Button type="button" variant="danger" loading={cancelling === order.id} disabled={Boolean(cancelling)} onClick={() => onCancel(order)}>Otkaži</Button>}</div></td>
  </tr>)}</tbody></table></div>
}

import { useId, useState, type RefObject } from 'react'
import { Badge, Button, Drawer, ErrorState, Skeleton } from '../components/ui'
import { orderLabels, orderTones } from '../components/ui/statusPresentation'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { AuthUser } from '../types/auth.types'
import type { ManagedOrder, OrderStatus } from '../types/order.types'
import { hasCapability } from '../auth/capabilities'
import { OrderProductImage } from './OrderProductImage'
import { canChangeOrder, customerLabel, handlerLabel, initials, itemCountLabel, orderActionLabels, orderErrorMessage, orderMoney, orderQuantity, shortOrderId } from './orderPresentation'

export function OrderDetails({ order, user, loading, error, busy, returnFocusRef, onClose, onRefresh, onStatus }: {
  order?: ManagedOrder; user: AuthUser | null; loading: boolean; error: unknown; busy: boolean
  returnFocusRef: RefObject<HTMLButtonElement | null>; onClose: () => void; onRefresh: () => void
  onStatus: (order: ManagedOrder, status: OrderStatus) => void
}) {
  const [tab, setTab] = useState<'OVERVIEW' | 'ITEMS'>('OVERVIEW'), id = useId()
  return <Drawer open size="wide" title="Detalji narudžbine" className="gm-orders-details-drawer" onClose={onClose}
    closeDisabled={busy} returnFocusRef={returnFocusRef}>
    <div className="gm-orders-details">
      <div className="gm-orders-details-scroll">
        {loading && <Skeleton lines={6} label="Učitavanje detalja narudžbine" />}
        {Boolean(error) && <ErrorState title={order ? 'Detalji nisu osveženi' : 'Detalji nisu dostupni'} message={orderErrorMessage(error, 'Narudžbinu nije moguće učitati.')}
          action={<Button type="button" variant="secondary" onClick={onRefresh}>Pokušaj ponovo</Button>} />}
        {order && <>
          <div className="gm-orders-details-hero"><strong title={order.id}>{shortOrderId(order.id)}</strong>
            <Badge tone={orderTones[order.status]}>{orderLabels[order.status]}</Badge>
            <time dateTime={order.createdAt}>{formatBusinessDateTime(order.createdAt, false, 'sr-Latn-RS')}</time></div>
          <div className="gm-orders-details-tabs" role="tablist" aria-label="Detalji narudžbine">
            {(['OVERVIEW', 'ITEMS'] as const).map(value => <button key={value} id={`${id}-${value}-tab`} role="tab" type="button"
              aria-selected={tab === value} aria-controls={`${id}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
              onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault(); const next = event.key === 'Home' ? 'OVERVIEW' : event.key === 'End' ? 'ITEMS' : value === 'OVERVIEW' ? 'ITEMS' : 'OVERVIEW'
                setTab(next); document.getElementById(`${id}-${next}-tab`)?.focus()
              } }}>{value === 'OVERVIEW' ? 'Pregled' : 'Stavke'}</button>)}
          </div>
          <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}-tab`}>
            {tab === 'OVERVIEW' ? <>
              <div className="gm-orders-details-customer"><span className="gm-orders-avatar gm-orders-avatar--large" aria-hidden="true">
                {initials(hasCapability(user, 'CUSTOMER_READ') ? order.customerName : null)}</span><div><span>Klijent</span><h3>{customerLabel(order, user)}</h3></div></div>
              <dl className="gm-orders-details-fields">
                <div className="gm-orders-wide"><dt>ID narudžbine</dt><dd><code>{order.id}</code></dd></div>
                <div><dt>Datum i vreme</dt><dd>{formatBusinessDateTime(order.createdAt, false, 'sr-Latn-RS')}</dd></div>
                <div><dt>Status</dt><dd>{orderLabels[order.status]}</dd></div>
                <div><dt>Obrađuje</dt><dd>{handlerLabel(order, user)}</dd></div>
                <div><dt>Broj stavki</dt><dd>{itemCountLabel(order.items.length)} · {orderQuantity(order)} kom.</dd></div>
                <div><dt>Poslednja izmena</dt><dd>{formatBusinessDateTime(order.updatedAt, false, 'sr-Latn-RS')}</dd></div>
                <div><dt>Ukupan iznos</dt><dd className="gm-orders-details-total">{orderMoney.format(order.totalPrice)}</dd></div>
              </dl>
            </> : <div className="gm-orders-detail-items">
              <p>Cene i količine sačuvane pri kreiranju narudžbine.</p>
              {order.items.map(item => <article key={item.productId} className="gm-orders-detail-item">
                <OrderProductImage item={item} /><div className="gm-orders-detail-item-info"><h3>{item.productName || (hasCapability(user, 'CATALOG_READ') ? 'Proizvod nije dostupan u katalogu' : 'Podaci o proizvodu nisu dostupni')}</h3>
                  {!item.productName && <small>ID proizvoda: {item.productId}</small>}
                  <div><span>Količina: <strong>{item.quantity}</strong></span><span>Jedinična cena: <strong>{orderMoney.format(item.unitPrice)}</strong></span></div>
                  <strong className="gm-orders-line-total">Ukupno: {orderMoney.format(item.lineTotal)}</strong></div>
              </article>)}
              <div className="gm-orders-items-total"><span>Ukupno</span><strong>{orderMoney.format(order.totalPrice)}</strong></div>
            </div>}
          </section>
        </>}
      </div>
      {order && <div className="gm-orders-details-actions">
        {(['IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'] as const).filter(status => canChangeOrder(order, status, user)).map(status =>
          <Button key={status} type="button" variant={status === 'CANCELLED' ? 'danger' : 'primary'} disabled={busy || Boolean(error)}
            onClick={() => onStatus(order, status)}>{orderActionLabels[status]}</Button>)}
        {(order.status === 'COMPLETED' || order.status === 'CANCELLED') && <span>{order.status === 'COMPLETED' ? 'Narudžbina je završena.' : 'Narudžbina je otkazana.'}</span>}
      </div>}
    </div>
  </Drawer>
}

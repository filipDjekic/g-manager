import { useEffect, useRef } from 'react'
import { hasCapability } from '../auth/capabilities'
import { Badge, TableShell } from '../components/ui'
import { orderLabels, orderTones } from '../components/ui/statusPresentation'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { AuthUser } from '../types/auth.types'
import type { ManagedOrder } from '../types/order.types'
import { OrderActionsMenu, type OrderAction } from './OrderActionsMenu'
import { OrderProductImage } from './OrderProductImage'
import { canChangeOrder, customerLabel, initials, itemCountLabel, orderMoney, orderQuantity, shortOrderId } from './orderPresentation'

function OrderRow({ order, user, selected, active, busy, onSelect, onAction }: {
  order: ManagedOrder; user: AuthUser | null; selected: boolean; active: boolean; busy: boolean
  onSelect: () => void; onAction: (action: OrderAction, trigger: HTMLButtonElement) => void
}) {
  const opener = useRef<HTMLButtonElement>(null)
  const selectable = canChangeOrder(order, 'IN_PROGRESS', user) || canChangeOrder(order, 'CANCELLED', user)
  const customer = customerLabel(order, user)
  return <tr className={`${active ? 'is-active' : ''} ${selected ? 'is-selected' : ''}`} onClick={event => {
    if (!(event.target as HTMLElement).closest('button, input, label, a') && opener.current) onAction('DETAILS', opener.current)
  }}>
    <td className="gm-orders-select-cell" data-label="Izbor"><input type="checkbox" checked={selected} disabled={busy || !selectable && !selected}
      onChange={onSelect} aria-label={`Izaberi narudžbinu ${shortOrderId(order.id)}`} /></td>
    <td data-label="Narudžbina"><button ref={opener} type="button" className="gm-orders-id-button" title={order.id}
      aria-label={`Detalji narudžbine ${order.id}`} onClick={event => onAction('DETAILS', event.currentTarget)}>{shortOrderId(order.id)}</button></td>
    <td data-label="Datum i vreme"><time dateTime={order.createdAt}>{formatBusinessDateTime(order.createdAt, false, 'sr-Latn-RS')}</time></td>
    <td data-label="Klijent"><div className="gm-orders-customer"><span className="gm-orders-avatar" aria-hidden="true">
      {initials(hasCapability(user, 'CUSTOMER_READ') ? order.customerName : null)}</span><span>{customer}</span></div></td>
    <td data-label="Stavke"><div className="gm-orders-item-summary"><div className="gm-orders-thumbnails" aria-hidden="true">
      {order.items.slice(0, 3).map(item => <OrderProductImage key={item.productId} item={item} />)}</div>
      <div><strong>{itemCountLabel(order.items.length)} · {orderQuantity(order)} kom.</strong>
        <span>{order.items.slice(0, 2).map(item => item.productName || 'Proizvod nije dostupan').join(', ')}{order.items.length > 2 ? ` +${order.items.length - 2}` : ''}</span></div></div></td>
    <td className="gm-orders-amount" data-label="Iznos"><strong>{orderMoney.format(order.totalPrice)}</strong></td>
    <td data-label="Status"><Badge tone={orderTones[order.status]}>{orderLabels[order.status]}</Badge></td>
    <td data-label="Akcije"><div className="gm-orders-row-actions"><button type="button" className="gm-orders-mobile-details"
      onClick={event => onAction('DETAILS', event.currentTarget)}>Detalji</button><OrderActionsMenu order={order} user={user} disabled={busy} onAction={onAction} /></div></td>
  </tr>
}

export function OrdersTable({ orders, user, selected, detailId, busy, onSelect, onSelectAll, onAction }: {
  orders: ManagedOrder[]; user: AuthUser | null; selected: Set<string>; detailId: string; busy: boolean
  onSelect: (order: ManagedOrder) => void; onSelectAll: (ids: string[]) => void
  onAction: (order: ManagedOrder, action: OrderAction, trigger: HTMLButtonElement) => void
}) {
  const checkbox = useRef<HTMLInputElement>(null)
  const eligible = orders.filter(order => canChangeOrder(order, 'IN_PROGRESS', user) || canChangeOrder(order, 'CANCELLED', user))
  const checked = eligible.length > 0 && eligible.every(order => selected.has(order.id))
  const partiallyChecked = !checked && eligible.some(order => selected.has(order.id))
  useEffect(() => { if (checkbox.current) checkbox.current.indeterminate = partiallyChecked }, [partiallyChecked])
  return <div className="gm-orders-table-wrap"><TableShell label="Pregled narudžbina"><table className="gm-orders-table">
    <thead><tr><th scope="col" className="gm-orders-select-cell"><input ref={checkbox} type="checkbox" checked={checked}
      disabled={busy || !eligible.length} aria-label="Izaberi sve dostupne narudžbine na ovoj stranici"
      onChange={() => onSelectAll(checked ? [] : eligible.map(order => order.id))} /></th>
      <th scope="col">Narudžbina</th><th scope="col">Datum i vreme</th><th scope="col">Klijent</th><th scope="col">Stavke</th>
      <th scope="col" className="gm-orders-amount">Iznos</th><th scope="col">Status</th><th scope="col">Akcije</th></tr></thead>
    <tbody>{orders.map(order => <OrderRow key={order.id} order={order} user={user} selected={selected.has(order.id)} active={detailId === order.id}
      busy={busy} onSelect={() => onSelect(order)} onAction={(action, trigger) => onAction(order, action, trigger)} />)}</tbody>
  </table></TableShell></div>
}

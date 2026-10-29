import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import type { OrderStatus } from '../types/order.types'
import { orderActionLabels, orderMoney, shortOrderId } from './orderPresentation.model'

export function useOrderActionConfirmation() {
  const { confirm, confirmationDialog } = useConfirmDialog()
  function request(order: { id: string; totalPrice: number }, next: OrderStatus, commit: () => Promise<unknown>) {
    if (next === 'IN_PROGRESS' || next === 'READY') { void commit().catch(() => {}); return }
    confirm({ title: orderActionLabels[next] ?? 'Promeni status', confirmLabel: orderActionLabels[next],
      variant: next === 'CANCELLED' ? 'danger' : 'warning',
      description: `${shortOrderId(order.id)} · ${orderMoney.format(order.totalPrice)}. ${next === 'CANCELLED' ? 'Narudžbina će biti otkazana.' : 'Narudžbina će biti završena i više se neće moći menjati.'}`,
      onConfirm: commit })
  }
  return { request, confirmationDialog }
}

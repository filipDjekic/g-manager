import { ActionMenu } from '../components/ui'
import type { AuthUser } from '../types/auth.types'
import type { ManagedOrder, OrderStatus } from '../types/order.types'
import { canChangeOrder, orderActionLabels, shortOrderId } from './orderPresentation.model'

export type OrderAction = 'DETAILS' | OrderStatus
export function OrderActionsMenu({ order, user, disabled, onAction }: {
  order: ManagedOrder; user: AuthUser | null; disabled: boolean
  onAction: (action: OrderAction, trigger: HTMLButtonElement) => void
}) {
  return <ActionMenu label={'Akcije za narudžbinu ' + shortOrderId(order.id)} disabled={disabled} actions={[
    { label: 'Detalji', onClick: trigger => onAction('DETAILS', trigger) },
    ...(['IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'] as const).filter(status => canChangeOrder(order, status, user)).map(status => ({
      label: orderActionLabels[status] ?? 'Promeni status', danger: status === 'CANCELLED', onClick: (trigger: HTMLButtonElement) => onAction(status, trigger),
    })),
  ]} />
}

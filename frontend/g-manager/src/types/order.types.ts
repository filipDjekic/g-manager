export type OrderStatus = 'CREATED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED'

export interface OrderItem {
  productId: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface Order {
  id: string
  customerId: string
  handledBy: string | null
  status: OrderStatus
  totalPrice: number
  items: OrderItem[]
  createdAt: string
  updatedAt: string
  version: number
}

export interface CreateOrderInput {
  items: Array<{ productId: string; quantity: number }>
}

export interface ManagedOrderItem extends OrderItem {
  productName: string | null
  productImageUrl: string | null
}

export interface ManagedOrder extends Omit<Order, 'items'> {
  items: ManagedOrderItem[]
  customerName: string | null
  handledByName: string | null
}

export interface OrderStatistics {
  total: number
  completed: number
  inProgress: number
  cancelled: number
  from: string | null
  to: string | null
  timeZone: string
}

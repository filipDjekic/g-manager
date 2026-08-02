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

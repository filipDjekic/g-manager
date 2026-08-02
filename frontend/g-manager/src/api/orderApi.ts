import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type { CreateOrderInput, Order, OrderStatus } from '../types/order.types'

export interface OrderFilters {
  page: number
  size: number
  status?: OrderStatus
  handledBy?: string
  from?: string
  to?: string
}

export const orderApi = {
  create: (input: CreateOrderInput, idempotencyKey: string) =>
    apiClient.post<Order>('/orders', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }).then(({ data }) => data),
  mine: (params: OrderFilters) =>
    apiClient.get<PageResponse<Order>>('/orders/me', { params }).then(({ data }) => data),
  list: (params: OrderFilters) =>
    apiClient.get<PageResponse<Order>>('/orders', { params }).then(({ data }) => data),
  changeStatus: (order: Order, status: OrderStatus) =>
    apiClient.patch<Order>(`/orders/${order.id}/status`, {
      status,
      version: order.version,
    }).then(({ data }) => data),
}

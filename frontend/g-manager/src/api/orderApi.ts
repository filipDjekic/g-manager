import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type { CreateOrderInput, ManagedOrder, Order, OrderStatistics, OrderStatus } from '../types/order.types'
import type { BulkItem, BulkOperationResponse } from '../types/bulk.types'

export interface OrderFilters {
  page: number
  size: number
  status?: OrderStatus
  handledBy?: string
  from?: string
  to?: string
  search?: string
  sort?: 'createdAt' | 'updatedAt' | 'status' | 'totalPrice'
  direction?: 'ASC' | 'DESC'
}

export const orderApi = {
  create: (input: CreateOrderInput, idempotencyKey: string) =>
    apiClient.post<Order>('/orders', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }).then(({ data }) => data),
  mine: (params: OrderFilters) =>
    apiClient.get<PageResponse<Order>>('/orders/me', { params }).then(({ data }) => data),
  list: (params: OrderFilters) =>
    apiClient.get<PageResponse<ManagedOrder>>('/orders', { params }).then(({ data }) => data),
  detail: (id: string) => apiClient.get<ManagedOrder>(`/orders/${id}`).then(({ data }) => data),
  statistics: (params: Pick<OrderFilters, 'from' | 'to' | 'handledBy'>) =>
    apiClient.get<OrderStatistics>('/orders/statistics', { params }).then(({ data }) => data),
  changeStatus: (order: Pick<Order, 'id' | 'version'>, status: OrderStatus) =>
    apiClient.patch<Order>(`/orders/${order.id}/status`, {
      status,
      version: order.version,
    }).then(({ data }) => data),
  bulkStatus: (status: OrderStatus, items: BulkItem[]) =>
    apiClient.patch<BulkOperationResponse>('/orders/bulk/status', { status, items }).then(({ data }) => data),
}

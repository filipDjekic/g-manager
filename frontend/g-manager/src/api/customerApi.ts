import { apiClient } from './client'
import type { CustomerDetail, CustomerPage } from '../types/customer.types'

export const customerApi = {
  list: (params: { search?: string; active?: boolean; page: number; size: number }) =>
    apiClient.get<CustomerPage>('/customers', { params }).then(({ data }) => data),
  detail: (id: string) => apiClient.get<CustomerDetail>(`/customers/${id}`).then(({ data }) => data),
}

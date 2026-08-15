import { apiClient } from './client'
import type { CustomerCrm, CustomerCrmNote, CustomerDetail, CustomerInput,
  CustomerOnboarding, CustomerPage, CustomerUpdateInput } from '../types/customer.types'

export const customerApi = {
  create: (request: CustomerInput) =>
    apiClient.post<CustomerOnboarding>('/customers', request).then(({ data }) => data),
  update: (id: string, request: CustomerUpdateInput) =>
    apiClient.patch(`/customers/${id}`, request).then(({ data }) => data),
  deactivate: (id: string) => apiClient.post(`/customers/${id}/deactivate`),
  list: (params: { search?: string; active?: boolean; page: number; size: number }) =>
    apiClient.get<CustomerPage>('/customers', { params }).then(({ data }) => data),
  detail: (id: string) => apiClient.get<CustomerDetail>(`/customers/${id}`).then(({ data }) => data),
  crm: (id: string, search?: string) =>
    apiClient.get<CustomerCrm>(`/customers/${id}/crm`, { params: { search } }).then(({ data }) => data),
  addCrmNote: (id: string, body: string) =>
    apiClient.post<CustomerCrmNote>(`/customers/${id}/crm/notes`, { body }).then(({ data }) => data),
  updateCrmNote: (customerId: string, noteId: string, body: string, version: number) =>
    apiClient.put<CustomerCrmNote>(`/customers/${customerId}/crm/notes/${noteId}`, { body, version }).then(({ data }) => data),
  deleteCrmNote: (customerId: string, noteId: string, version: number) =>
    apiClient.delete(`/customers/${customerId}/crm/notes/${noteId}`, { params: { version } }),
  addCrmTag: (id: string, name: string) =>
    apiClient.post<CustomerCrm>(`/customers/${id}/crm/tags`, { name }).then(({ data }) => data),
  removeCrmTag: (id: string, name: string, version: number) =>
    apiClient.delete<CustomerCrm>(`/customers/${id}/crm/tags/${encodeURIComponent(name)}`, { params: { version } })
      .then(({ data }) => data),
}

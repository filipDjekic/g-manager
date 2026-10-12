import { apiClient } from './client'
import type { PageResponse } from '../types/api.types'
import type { CreateUserRequest, EmployeeAssignments, EmployeeLeave, EmployeeStatistics, UserResponse, UserStatistics } from '../types/user.types'
import type { BulkOperationResponse } from '../types/bulk.types'

export const userApi = {
  statistics: () => apiClient.get<UserStatistics>('/users/statistics').then(({ data }) => data),
  detail: (id: string, deleted = false) => apiClient.get<UserResponse>(`/users/${encodeURIComponent(id)}`,
    { params: { deleted } }).then(({ data }) => data),
  employeeStatistics: () => apiClient.get<EmployeeStatistics>('/users/employees/statistics').then(({ data }) => data),
  employee: (id: string) => apiClient.get<UserResponse>(`/users/employees/${encodeURIComponent(id)}`).then(({ data }) => data),
  employeeAssignments: (id: string) => apiClient.get<EmployeeAssignments>(`/users/employees/${encodeURIComponent(id)}/assignments`).then(({ data }) => data),
  employeeLeaves: (id: string) => apiClient.get<EmployeeLeave[]>(`/users/employees/${encodeURIComponent(id)}/time-off`).then(({ data }) => data),
  avatarPreview: (id: string, signal?: AbortSignal) => apiClient.get<Blob>(`/documents/${encodeURIComponent(id)}/content`,
    { params: { preview: true }, responseType: 'blob', signal }).then(({ data }) => data),
  me: () => apiClient.get<UserResponse>('/users/me').then(({ data }) => data),
  updateMe: (name: string) =>
    apiClient.patch<UserResponse>('/users/me', { name }).then(({ data }) => data),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.patch<void>('/users/me/password', { currentPassword, newPassword }),
  uploadAvatar: (avatar: File) => {
    const form = new FormData()
    form.append('avatar', avatar)
    return apiClient.post<UserResponse>('/users/me/avatar', form).then(({ data }) => data)
  },
  list: (params: { page: number; size: number; role?: string; active?: boolean; search?: string; sort?: string; direction?: string }) =>
    apiClient.get<PageResponse<UserResponse>>('/users', { params }).then(({ data }) => data),
  create: (request: CreateUserRequest) =>
    apiClient.post<UserResponse>('/users', request).then(({ data }) => data),
  deactivate: (id: string) => apiClient.patch<void>(`/users/${id}/deactivate`),
  bulkDeactivate: (ids: string[]) => apiClient.post<BulkOperationResponse>('/users/bulk/deactivate', { ids })
    .then(({ data }) => data),
  deleted: (page = 0, size = 20, filters?: { role?: string; active?: boolean; search?: string; sort?: string; direction?: string }) =>
    apiClient.get<PageResponse<UserResponse>>('/users/deleted', { params: { page, size, ...filters } })
      .then(({ data }) => data),
  remove: (id: string, reason: string) => apiClient.delete<void>(`/users/${id}`, { data: { reason } }),
  restore: (id: string) => apiClient.post<UserResponse>(`/users/${id}/restore`).then(({ data }) => data),
  employeesPage: (page = 0, size = 100) =>
    apiClient.get<PageResponse<UserResponse>>('/users/employees', { params: { page, size } }).then(({ data }) => data),
  employees: () =>
    apiClient.get<PageResponse<UserResponse>>('/users/employees', {
      params: { page: 0, size: 100 },
    }).then(({ data }) => data.content),
}

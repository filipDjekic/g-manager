import { apiClient } from './client'
import type { GenerateReport, ReportDefinition, ReportFormat, ReportItem, ReportSchedule, ReportTemplate } from '../types/report.types'
export const reportApi = {
  definitions: () => apiClient.get<ReportDefinition[]>('/reports/definitions').then((r) => r.data),
  list: () => apiClient.get<ReportItem[]>('/reports').then((r) => r.data),
  generate: (data: GenerateReport) => apiClient.post<ReportItem>('/reports', data).then((r) => r.data),
  cancel: (id: string) => apiClient.post<ReportItem>(`/reports/${id}/cancel`).then((r) => r.data),
  download: (id: string) => apiClient.get<Blob>(`/reports/${id}/download`, { responseType: 'blob' }).then((r) => URL.createObjectURL(r.data)),
  schedules: () => apiClient.get<ReportSchedule[]>('/reports/schedules').then((r) => r.data),
  createSchedule: (data: GenerateReport & { localTime: string; dayOfWeek: number | null }) => apiClient.post<ReportSchedule>('/reports/schedules', data).then((r) => r.data),
  removeSchedule: (id: string) => apiClient.delete(`/reports/schedules/${id}`),
  templates: () => apiClient.get<ReportTemplate[]>('/reports/templates').then((r) => r.data),
  createTemplate: (data: { name: string; definitionKey: string; format: ReportFormat; from: string; to: string }) => apiClient.post<ReportTemplate>('/reports/templates', data).then((r) => r.data),
}

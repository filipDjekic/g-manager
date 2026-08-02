import { apiClient } from './client'
import type {
  DayOfWeek,
  WorkingHours,
  WorkingHoursException,
  WorkingHoursExceptionInput,
} from '../types/workingHours.types'

export const workingHoursApi = {
  list: () =>
    apiClient.get<WorkingHours[]>('/working-hours').then(({ data }) => data),
  update: (hours: WorkingHours) =>
    apiClient.put<WorkingHours>(`/working-hours/${hours.dayOfWeek}`, {
      openTime: hours.openTime,
      closeTime: hours.closeTime,
      active: hours.active,
      version: hours.version,
    }).then(({ data }) => data),
  updateDay: (
    dayOfWeek: DayOfWeek,
    input: Pick<WorkingHours, 'openTime' | 'closeTime' | 'active' | 'version'>,
  ) => apiClient.put<WorkingHours>(`/working-hours/${dayOfWeek}`, input)
    .then(({ data }) => data),
  listExceptions: () =>
    apiClient.get<WorkingHoursException[]>('/working-hours/exceptions')
      .then(({ data }) => data),
  createException: (input: WorkingHoursExceptionInput) =>
    apiClient.post<WorkingHoursException>('/working-hours/exceptions', input)
      .then(({ data }) => data),
  updateException: (id: string, input: WorkingHoursExceptionInput) =>
    apiClient.put<WorkingHoursException>(`/working-hours/exceptions/${id}`, input)
      .then(({ data }) => data),
  deleteException: (exception: WorkingHoursException) =>
    apiClient.delete<void>(`/working-hours/exceptions/${exception.id}`, {
      params: { version: exception.version },
    }),
}

import { apiClient } from './client'
import type { ApplicationDefinition, ApplicationDefinitionInput, ApplicationProfile,
  ApplicationProfileInput, EnrollmentToken, GamingClientPackage, MachineIdentity, StationOverview, StationProfileInput } from '../types/station.types'

export const stationApi = {
  overview: () => apiClient.get<StationOverview[]>('/stations').then(({ data }) => data),
  saveStation: (resourceId:string, request:StationProfileInput) =>
    apiClient.put<StationOverview>(`/stations/${resourceId}/profile`, request).then(({ data }) => data),
  definitions: () => apiClient.get<ApplicationDefinition[]>('/stations/applications').then(({ data }) => data),
  createDefinition: (request:ApplicationDefinitionInput) =>
    apiClient.post<ApplicationDefinition>('/stations/applications', request).then(({ data }) => data),
  updateDefinition: (id:string, request:ApplicationDefinitionInput) =>
    apiClient.put<ApplicationDefinition>(`/stations/applications/${id}`, request).then(({ data }) => data),
  deleteDefinition: (id:string, version:number) =>
    apiClient.delete(`/stations/applications/${id}`, { params:{ version } }),
  profiles: () => apiClient.get<ApplicationProfile[]>('/stations/application-profiles').then(({ data }) => data),
  createProfile: (request:ApplicationProfileInput) =>
    apiClient.post<ApplicationProfile>('/stations/application-profiles', request).then(({ data }) => data),
  updateProfile: (id:string, request:ApplicationProfileInput) =>
    apiClient.put<ApplicationProfile>(`/stations/application-profiles/${id}`, request).then(({ data }) => data),
  deleteProfile: (id:string, version:number) =>
    apiClient.delete(`/stations/application-profiles/${id}`, { params:{ version } }),
  machineIdentities: (stationId:string) => apiClient.get<MachineIdentity[]>(`/stations/${stationId}/machine-identity`).then(({data})=>data),
  createEnrollmentToken: (stationId:string) => apiClient.post<EnrollmentToken>(`/stations/${stationId}/machine-identity/enrollment-token`).then(({data})=>data),
  createRotationToken: (stationId:string) => apiClient.post<EnrollmentToken>(`/stations/${stationId}/machine-identity/rotation-token`).then(({data})=>data),
  revokeMachineIdentities: (stationId:string) => apiClient.post(`/stations/${stationId}/machine-identity/revoke`),
  clientPackage: () => apiClient.get<GamingClientPackage>('/stations/client-package').then(({data})=>data),
}

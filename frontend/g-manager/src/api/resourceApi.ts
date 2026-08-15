import { apiClient } from './client'
import type { AreaView, LocationView, ResourceAvailability, ResourceView } from '../types/resource.types'
export const resourceApi={
 locations:()=>apiClient.get<LocationView[]>('/resources/locations').then(r=>r.data),
 areas:(id:string)=>apiClient.get<AreaView[]>(`/resources/locations/${id}/areas`).then(r=>r.data),
 resources:(id:string)=>apiClient.get<ResourceView[]>(`/resources/areas/${id}`).then(r=>r.data),
 availability:(id:string,start:string,end:string,serviceId?:string)=>apiClient.get<ResourceAvailability[]>(`/resources/areas/${id}/availability`,{params:{start,end,serviceId}}).then(r=>r.data),
}

import { apiClient } from './client'
import type { AreaView, LocationView, ResourceAvailability, ResourceView, LocationInput, AreaInput, ResourceInput } from '../types/resource.types'
export const resourceApi={
 employeeAccess:(locationId:string)=>apiClient.get<Array<{employeeId:string;active:boolean;version:number}>>(`/resources/locations/${locationId}/employees`).then(r=>r.data),
 setEmployeeAccess:(locationId:string,employeeId:string,active:boolean,version?:number)=>apiClient.put(`/resources/locations/${locationId}/employees/${employeeId}`,{active,version}),
 saveLocation:(input:LocationInput,id?:string)=>(id?apiClient.put<LocationView>(`/resources/locations/${id}`,input):apiClient.post<LocationView>('/resources/locations',input)).then(r=>r.data),
 saveArea:(locationId:string,input:AreaInput,id?:string)=>(id?apiClient.put<AreaView>(`/resources/areas/${id}`,input):apiClient.post<AreaView>(`/resources/locations/${locationId}/areas`,input)).then(r=>r.data),
 saveResource:(areaId:string,input:ResourceInput,id?:string)=>(id?apiClient.put<ResourceView>(`/resources/${id}`,input):apiClient.post<ResourceView>(`/resources/areas/${areaId}`,input)).then(r=>r.data),
 locations:()=>apiClient.get<LocationView[]>('/resources/locations').then(r=>r.data),
 areas:(id:string)=>apiClient.get<AreaView[]>(`/resources/locations/${id}/areas`).then(r=>r.data),
 resources:(id:string)=>apiClient.get<ResourceView[]>(`/resources/areas/${id}`).then(r=>r.data),
 availability:(id:string,start:string,end:string,serviceId?:string)=>apiClient.get<ResourceAvailability[]>(`/resources/areas/${id}/availability`,{params:{start,end,serviceId}}).then(r=>r.data),
}

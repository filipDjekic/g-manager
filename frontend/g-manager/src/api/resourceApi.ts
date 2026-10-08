import { apiClient } from './client'
import type { AreaView, LocationView, ResourceAvailability, ResourceView, LocationInput, AreaInput, ResourceInput, BookingOptions, BookingResource } from '../types/resource.types'
export const resourceApi={
 reservationResources:()=>apiClient.get<BookingResource[]>('/resources/reservation-filters').then(r=>r.data),
 managementScope:()=>apiClient.get<{allResources:boolean;resourceIds:string[]}>('/resources/management-scope').then(r=>r.data),
 resourceEmployees:(id:string)=>apiClient.get<Array<{employeeId:string;active:boolean;version:number;employeeName:string;employeeActive:boolean}>>(`/resources/${id}/employees`).then(r=>r.data),
 setResourceEmployee:(id:string,employeeId:string,active:boolean,version?:number)=>apiClient.put(`/resources/${id}/employees/${employeeId}`,{active,version}),
 bookingOptions:(params:{serviceId:string;locationId?:string;start?:string;end?:string;managedOnly?:boolean})=>apiClient.get<BookingOptions>('/resources/booking-options',{params}).then(r=>r.data),
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

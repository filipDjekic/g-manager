import { apiClient } from './client'; import type { AppDocument } from '../types/document.types'
export const documentApi={
 list:(resourceType:string,resourceId:string)=>apiClient.get<AppDocument[]>('/documents',{params:{resourceType,resourceId}}).then(r=>r.data),
 upload:(resourceType:string,resourceId:string,file:File,onProgress:(value:number)=>void,signal:AbortSignal)=>{const data=new FormData();data.append('resourceType',resourceType);data.append('resourceId',resourceId);data.append('file',file);return apiClient.post<AppDocument>('/documents',data,{signal,onUploadProgress:e=>onProgress(e.total?Math.round(e.loaded/e.total*100):0)}).then(r=>r.data)},
 version:(document:AppDocument,file:File,onProgress:(value:number)=>void,signal:AbortSignal)=>{const data=new FormData();data.append('version',String(document.version));data.append('file',file);return apiClient.post<AppDocument>(`/documents/${document.id}/versions`,data,{signal,onUploadProgress:e=>onProgress(e.total?Math.round(e.loaded/e.total*100):0)}).then(r=>r.data)},
 remove:(document:AppDocument)=>apiClient.delete(`/documents/${document.id}`,{params:{version:document.version}}),
 restore:(id:string)=>apiClient.post<AppDocument>(`/documents/${id}/restore`).then(r=>r.data),
 content:(id:string,versionId:string,preview=false)=>apiClient.get<Blob>(`/documents/${id}/content`,{params:{versionId,preview},responseType:'blob'}).then(r=>URL.createObjectURL(r.data)),
}

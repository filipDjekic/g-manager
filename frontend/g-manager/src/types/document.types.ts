export type ScanStatus = 'PENDING' | 'CLEAN' | 'REJECTED' | 'ERROR'
export interface DocumentVersion { id:string; number:number; filename:string; contentType:string; sizeBytes:number; checksumSha256:string; scanStatus:ScanStatus; scannedAt:string|null; createdAt:string }
export interface AppDocument { id:string; resourceType:string; resourceId:string; displayName:string; deleted:boolean; version:number; createdAt:string; versions:DocumentVersion[] }

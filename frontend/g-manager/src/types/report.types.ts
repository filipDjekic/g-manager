export type ReportFormat='CSV'|'XLSX'|'PDF'; export type ReportStatus='QUEUED'|'RUNNING'|'COMPLETED'|'FAILED'|'CANCELLED'|'EXPIRED'
export interface ReportDefinition{key:string;label:string;metricDefinition:string;formats:ReportFormat[]}
export interface ReportItem{id:string;definitionKey:string;format:ReportFormat;status:ReportStatus;progress:number;rowCount:number|null;documentId:string|null;errorMessage:string|null;snapshotAt:string;expiresAt:string|null;version:number}
export interface ReportSchedule{id:string;definitionKey:string;format:ReportFormat;timezone:string;localTime:string;dayOfWeek:number|null;active:boolean;nextRunAt:string;version:number}
export interface ReportTemplate{id:string;name:string;definitionKey:string;format:ReportFormat;filters:string;version:number}
export interface GenerateReport{definitionKey:string;format:ReportFormat;from:string;to:string;timezone:string;locale:string}

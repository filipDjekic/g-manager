export interface AiReportSummary { usageId:string; aiGenerated:boolean; summary:string; limitations:string; sources:Array<{reportId:string;definition:string;rowCount:number;snapshotAt:string}>; promptVersion:string; outputVersion:string }
export type AiFeedback='ACCEPTED'|'REJECTED'|'CORRECTED'

import {apiClient} from './client';import type {AiFeedback,AiReportSummary} from '../types/ai.types';
export const aiApi={summarize:(reportId:string)=>apiClient.post<AiReportSummary>(`/ai/report-summaries/${reportId}`,{consent:true}).then(r=>r.data),feedback:(usageId:string,feedback:AiFeedback)=>apiClient.post(`/ai/usage/${usageId}/feedback`,{feedback})}

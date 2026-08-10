export interface BulkItem { id: string; version: number }
export interface BulkItemOutcome { id: string; success: boolean; message: string }
export interface BulkOperationResponse {
  requested: number; succeeded: number; failed: number; outcomes: BulkItemOutcome[]
}

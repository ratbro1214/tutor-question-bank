import type { CropRegion } from './paper';
export type BatchItem = { id:string; question_number:number; paper_question_id:string|null; normalized_text:string; text_hash:string|null; status:'NEW'|'DUPLICATE'|'NEEDS_REVIEW'|'FAILED'; canonical_id:string|null; duplicate_canonical_id:string|null; duplicate_item_id:string|null; reason:string; question_text:string|null; image_key:string|null; regions:string|null; observed_hash:string|null };
export type BatchFile = { id:string; filename:string; status:string; paper_id:string|null; source_document_id:string|null; error:string; items:BatchItem[] };
export type BatchResult = { id:string; status:string; created_at:string; files:BatchFile[]; counts:{pdfs:number; questions:number; NEW:number; DUPLICATE:number; NEEDS_REVIEW:number; FAILED:number; failedFiles:number; exactDuplicates:number} };
export type ReviewApplication = {formula:boolean;options:boolean;subquestions:boolean;visual:boolean;cross_page:boolean};
export type BatchHistory = { id: string; status: string; created_at: string; filenames: string[] };
export const batchStatusLabel = (status: string) => ({ pending: '待处理', processing: '处理中', completed: '已完成', completed_with_errors: '部分需处理', needs_review: '待核对', failed: '失败', NEW: '已新增', DUPLICATE: '已关联', NEEDS_REVIEW: '待核对', FAILED: '失败' }[status] || '待处理');
export const regionContext = (regions:CropRegion[]) => ({multiple_regions:regions.length>1,possible_cross_page:new Set(regions.map(r=>r.page)).size>1});

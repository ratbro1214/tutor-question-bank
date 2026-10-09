import assert from 'node:assert/strict';
import { normalizeQuestionTextV1, hashNormalizedText } from './paper-canonical-preview.mjs';
import { sha256, stableJSON, observedSourceHash, prepareReadyRecord, CONTENT_SCHEMA_VERSION, IDENTITY_VERSION } from './canonical-paper-import.mjs';
import { createPendingIdentityDecision } from './paper-identity-review-package.mjs';
import { DECISION_VERSION } from './canonical-identity-decision.mjs';
import { cropRegionSchema } from './paper';
import { regionContext, type BatchResult, type BatchItem, type BatchFile, type ReviewApplication } from './paper-batch';
import type { PaperQuestionRow, PaperRow } from './paper-server';

type Scope = {id:string;code:string;scope_type:string;kind:string;ownership_status:string;owner_principal_id:string};
type Paper = PaperRow & {file_hash:string};
export class ImportConflict extends Error {}
export async function privateScope(db:D1Database) {
 const scope=await db.prepare("SELECT * FROM question_library_scopes WHERE code='project-private'").first<Scope>();
 if(!scope||scope.kind!=='private'||scope.scope_type==='authorized_public'||scope.ownership_status!=='known'||scope.owner_principal_id!=='project_owner') throw new ImportConflict('project-private scope 未建立或归属不符，停止导入。');
 return scope;
}
export async function batchResult(db:D1Database,id:string):Promise<BatchResult> {
 const batch=await db.prepare('SELECT * FROM paper_import_batches WHERE id=?').bind(id).first<{id:string;status:string;created_at:string}>();
 if(!batch) throw new ImportConflict('批次不存在。');
 const files=(await db.prepare('SELECT * FROM paper_import_files WHERE batch_id=? ORDER BY position').bind(id).all<BatchFile>()).results;
 const items=(await db.prepare(`SELECT i.*,q.question_text,q.image_key,q.regions FROM paper_import_items i JOIN paper_import_files f ON f.id=i.file_id LEFT JOIN paper_questions q ON q.id=i.paper_question_id WHERE f.batch_id=? ORDER BY f.position,i.question_number`).bind(id).all<BatchItem & {file_id:string}>()).results;
 const counts={pdfs:files.length,questions:items.length,NEW:0,DUPLICATE:0,NEEDS_REVIEW:0,FAILED:0,failedFiles:files.filter(f=>f.status==='failed').length,exactDuplicates:0};
 for(const item of items) {counts[item.status]++;if(item.duplicate_canonical_id||item.duplicate_item_id||item.status==='DUPLICATE') counts.exactDuplicates++;}
 return {...batch,files:files.map(f=>({...f,items:items.filter(i=>i.file_id===f.id)})),counts};
}
export async function attachPaper(db:D1Database,batchId:string,fileId:string,paperId:string) {
 const scope=await privateScope(db);
 const file=await db.prepare('SELECT * FROM paper_import_files WHERE id=? AND batch_id=?').bind(fileId,batchId).first<BatchFile>();
 const paper=await db.prepare('SELECT * FROM papers WHERE id=?').bind(paperId).first<Paper>();
 if(!file||!paper||paper.source_type!=='application/pdf'||(file.paper_id&&file.paper_id!==paperId)) throw new ImportConflict('文件或试卷引用无效。');
 const sourceId=crypto.randomUUID();
 await db.batch([
  db.prepare(`INSERT OR IGNORE INTO source_documents(id,scope_id,source_type,title,math_paper_id,legacy_source_key,file_storage,storage_key,original_filename,mime_type,file_hash,metadata) VALUES(?,?,'math_paper',?,?,?,'r2',?,?,?,?,'{"import_stage":"3A"}')`).bind(sourceId,scope.id,paper.title,paper.id,paper.id,paper.source_key,paper.original_filename,paper.source_type,paper.file_hash),
  db.prepare(`UPDATE paper_import_files SET paper_id=?,source_document_id=(SELECT id FROM source_documents WHERE math_paper_id=? AND scope_id=? AND file_hash=? AND storage_key=?),status='processing' WHERE id=? AND batch_id=? AND status IN ('pending','processing')`).bind(paper.id,paper.id,scope.id,paper.file_hash,paper.source_key,fileId,batchId)
 ]);
 const updated=await db.prepare('SELECT * FROM paper_import_files WHERE id=?').bind(fileId).first<BatchFile>();
 if(!updated?.source_document_id) throw new ImportConflict('来源属于其他 scope 或来源文件不一致，未继续处理。');
}
export async function registerItem(db:D1Database,bucket:R2Bucket,batchId:string,fileId:string,input:{number:number;questionId?:string;error?:string}) {
 const scope=await privateScope(db);
 const file=await db.prepare('SELECT * FROM paper_import_files WHERE id=? AND batch_id=?').bind(fileId,batchId).first<BatchFile>();
 if(!file||file.status!=='processing') throw new ImportConflict('文件未处于处理中。');
 const existing=await db.prepare('SELECT id FROM paper_import_items WHERE file_id=? AND question_number=?').bind(fileId,input.number).first();
 if(existing) return;
 const q=input.questionId?await db.prepare('SELECT * FROM paper_questions WHERE id=? AND paper_id=?').bind(input.questionId,file.paper_id).first<PaperQuestionRow>():null;
 if(input.questionId&&!q) throw new ImportConflict('题目不属于本文件。');
 const normalized=q?normalizeQuestionTextV1(q.question_text,q.question_number):'',hash=hashNormalizedText(normalized);
 let status='NEEDS_REVIEW',reason='2E 要求人工确认题干、公式、选项、图形和完整性，自动切题尚无确认。',canonical:string|null=null;
 let duplicate:string|null=null,duplicateItem:string|null=null,decision:string|null=null;
 if(!q) {status='FAILED';reason=input.error||'题目保存失败。';}
 else {
  const regions=JSON.parse(q.regions),context=regionContext(regions);
  decision=JSON.stringify(createPendingIdentityDecision({paper_question_id:q.id,paper_id:q.paper_id,...context}));
  if(!normalized) reason='题干为空或无可用文本层。';
  else if(!regions.length||!regions.every((r:unknown)=>cropRegionSchema.safeParse(r).success)) reason='region 无效，需核对原件。';
  else if(!await bucket.head(q.image_key)) reason='题图缺失，需重新裁切。';
  else {
   const link=await db.prepare(`SELECT l.*,r.payload,r.normalized_hash,o.occurrence_hash,c.scope_id,c.status AS canonical_status,r.identity_status FROM question_module_links l JOIN canonical_questions c ON c.id=l.canonical_question_id JOIN canonical_question_revisions r ON r.id=c.current_revision_id AND r.canonical_question_id=c.id JOIN question_occurrences o ON o.id=l.occurrence_id AND o.canonical_question_id=c.id AND o.content_revision_id=r.id JOIN source_documents s ON s.id=o.source_document_id AND s.scope_id=c.scope_id AND s.math_paper_id=? WHERE l.module_type='paper_question' AND l.module_record_id=? AND o.image_key=? AND o.raw_text=? AND o.mapping_status='confirmed'`).bind(q.paper_id,q.id,q.image_key,q.question_text).first<{canonical_question_id:string;observed_source_hash:string;scope_id:string;payload:string;normalized_hash:string;occurrence_hash:string;canonical_status:string;identity_status:string}>();
   if(link&&link.scope_id===scope.id&&link.observed_source_hash===observedSourceHash(q)&&link.canonical_status==='active'&&link.identity_status==='ready') {
    try {
     const paper=await db.prepare('SELECT * FROM papers WHERE id=?').bind(q.paper_id).first<Paper>();
     const image=await bucket.get(q.image_key),source=paper?await bucket.get(paper.source_key):null;
     if(!paper||!image||!source) throw new Error('Missing source');
     const ready=prepareReadyRecord({question:q,paper,decision:JSON.parse(link.payload).human_review,imageHash:sha256(new Uint8Array(await image.arrayBuffer())),sourceHash:sha256(new Uint8Array(await source.arrayBuffer())),allowPendingBusiness:true});
     if(ready.identityHash!==link.normalized_hash||ready.imageHash!==link.occurrence_hash) throw new Error('Changed identity or image');
     status='DUPLICATE';canonical=link.canonical_question_id;reason='AUTO_READY：复用同来源、同版本、文件字节未变且已有人工 READY 的映射。';
    } catch {reason='既有映射的审核或文件字节核验不通过，保持待审核。';}
   }
   const match=await db.prepare(`SELECT c.id FROM canonical_questions c JOIN canonical_question_revisions r ON r.id=c.current_revision_id WHERE c.scope_id=? AND c.status='active' AND r.identity_status='ready' AND r.normalized_text=? AND json_extract(r.payload,'$.normalized_text_hash')=? LIMIT 1`).bind(scope.id,normalized,hash).first<{id:string}>();
   duplicate=match?.id||null;
   const prior=await db.prepare(`SELECT i.id FROM paper_import_items i JOIN paper_import_files f ON f.id=i.file_id JOIN paper_import_batches b ON b.id=f.batch_id WHERE b.scope_id=? AND i.text_hash=? AND i.normalized_text=? AND i.status<>'FAILED' ORDER BY i.rowid LIMIT 1`).bind(scope.id,hash,normalized).first<{id:string}>();
   duplicateItem=prior?.id||null;
   if(status==='NEEDS_REVIEW'&&context.multiple_regions) reason='多个 region / 可能跨页，须人工核对片段归属、顺序与完整性。';
   if(status==='NEEDS_REVIEW'&&(duplicate||duplicateItem)) reason+=' 文字规范化完全重复；完整身份尚未确认，未自动关联。';
  }
 }
 await db.batch([db.prepare(`INSERT OR IGNORE INTO paper_import_items(id,file_id,question_number,paper_question_id,normalized_text,text_hash,status,canonical_id,duplicate_canonical_id,duplicate_item_id,observed_hash,reason,decision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),fileId,input.number,q?.id||null,normalized,hash,status,canonical,duplicate,duplicateItem,q?observedSourceHash(q):null,reason,decision)]);
}

// Explicit user review goes through the same 2E decision validator and complete identity builder.
export async function confirmItem(db:D1Database,bucket:R2Bucket,batchId:string,itemId:string,app:ReviewApplication,observedHash:string) {
 const scope=await privateScope(db);
 const item=await db.prepare(`SELECT i.*,f.paper_id,f.source_document_id FROM paper_import_items i JOIN paper_import_files f ON f.id=i.file_id WHERE i.id=? AND f.batch_id=?`).bind(itemId,batchId).first<BatchItem & {file_id:string;paper_id:string;source_document_id:string}>();
 if(!item?.paper_question_id) throw new ImportConflict('待确认题不存在。');
 const q=await db.prepare('SELECT * FROM paper_questions WHERE id=?').bind(item.paper_question_id).first<PaperQuestionRow>();
 const paper=await db.prepare('SELECT * FROM papers WHERE id=?').bind(item.paper_id).first<Paper>();
 if(!q||!paper||observedHash!==item.observed_hash||observedSourceHash(q)!==observedHash) throw new ImportConflict('题目在预览后发生变化，请重新导入核对。');
 if(item.canonical_id) return;
 const image=await bucket.get(q.image_key),source=await bucket.get(paper.source_key);
 if(!image||!source) throw new ImportConflict('题图或原试卷缺失。');
 const regions=JSON.parse(q.regions),context=regionContext(regions);
 const decision={decision_version:DECISION_VERSION,decision_origin:'human',paper_question_id:q.id,paper_id:q.paper_id,review_status:'READY',reviewer:'project_owner',reviewed_at:new Date().toISOString(),
 scope_decision:{status:'confirmed',scope_id:scope.id,scope_code:scope.code,scope_type:scope.scope_type,kind:scope.kind,ownership_status:scope.ownership_status,owner_principal_id:scope.owner_principal_id,decision_basis:'用户在批量导入结果中逐题核对原卷与题图，确认作为本人项目私有题库入库。',authorization_evidence:''},
 applicability:app,review_context:context,text_complete:true,regions_complete:true,source_confirmed:true,
 formula_complete:app.formula?true:'not_applicable',options_complete:app.options?true:'not_applicable',subquestions_complete:app.subquestions?true:'not_applicable',visual_complete:app.visual?true:'not_applicable',cross_page_complete:app.cross_page?true:'not_applicable',missing_reasons:[],review_notes:`3A 结果页逐题人工确认；批次候选 ${itemId}`} ;
 const r=prepareReadyRecord({question:q,paper,decision,imageHash:sha256(new Uint8Array(await image.arrayBuffer())),sourceHash:sha256(new Uint8Array(await source.arrayBuffer())),allowPendingBusiness:true});
 const matches=(await db.prepare(`SELECT c.id AS canonical_id,r.id AS revision_id,r.payload,r.normalized_text FROM canonical_questions c JOIN canonical_question_revisions r ON r.id=c.current_revision_id WHERE c.scope_id=? AND c.status='active' AND r.identity_status='ready' AND r.normalized_text=? AND json_extract(r.payload,'$.normalized_text_hash')=?`).bind(scope.id,r.normalizedText,r.textHash).all<{canonical_id:string;revision_id:string;payload:string;normalized_text:string}>()).results;
 const exact=matches.filter(m=>stableJSON(JSON.parse(m.payload).identity)===stableJSON(r.identity));
 if(matches.length&&!exact.length) throw new ImportConflict('文字完全重复，但必要图形或完整身份不同；保留 NEEDS_REVIEW，未新增或合并 Canonical。');
 if(exact.length>1) throw new ImportConflict('同 scope 存在多个完整身份匹配，需核对。');
 const canonicalId=exact[0]?.canonical_id||'batch:'+sha256(scope.id+':'+r.textHash),revisionId=exact[0]?.revision_id||canonicalId+':1';
 const oldLink=await db.prepare("SELECT * FROM question_module_links WHERE module_type='paper_question' AND module_record_id=?").bind(q.id).first<{canonical_question_id:string;observed_source_hash:string}>();
 if(oldLink&&(oldLink.canonical_question_id!==canonicalId||oldLink.observed_source_hash!==r.observedHash)) throw new ImportConflict('旧映射发生变化，拒绝覆盖。');
 const statements:D1PreparedStatement[]=[];
 if(!exact.length) {
  statements.push(db.prepare("INSERT OR IGNORE INTO canonical_questions(id,scope_id,subject,status) VALUES(?,?,'math','provisional')").bind(canonicalId,scope.id));
  statements.push(db.prepare(`INSERT OR IGNORE INTO canonical_question_revisions(id,canonical_question_id,revision,subject,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,identity_status,change_reason,created_by) VALUES(?,?,1,'math',?,?,?,?,?,?,'ready','3A explicit human confirmation','project_owner')`).bind(revisionId,canonicalId,q.question_text,r.normalizedText,r.identityHash,CONTENT_SCHEMA_VERSION,IDENTITY_VERSION,stableJSON(r.payload)));
  statements.push(db.prepare("UPDATE canonical_questions SET current_revision_id=?,status='active' WHERE id=? AND current_revision_id IS NULL AND status='provisional'").bind(revisionId,canonicalId));
 }
 // A failed CHECK is a transaction guard, including simultaneous imports of equal text with unequal visuals.
 statements.push(db.prepare(`INSERT INTO paper_import_items(id,file_id,question_number,status) SELECT ?,?,-1,'GUARD_FAILED' WHERE
 NOT EXISTS(SELECT 1 FROM canonical_questions c JOIN canonical_question_revisions r ON r.id=c.current_revision_id WHERE c.id=? AND c.scope_id=? AND c.status='active' AND r.identity_status='ready' AND r.normalized_hash=? AND r.normalized_text=? AND json_extract(r.payload,'$.identity')=?)
 OR NOT EXISTS(SELECT 1 FROM paper_questions WHERE id=? AND revision=? AND updated_at=? AND image_key=? AND regions=? AND question_text=? AND status=? AND classification IS ?)
 OR NOT EXISTS(SELECT 1 FROM source_documents s JOIN papers p ON p.id=s.math_paper_id WHERE s.id=? AND s.scope_id=? AND p.id=? AND s.file_hash=? AND p.file_hash=s.file_hash AND s.storage_key=? AND p.source_key=s.storage_key)
 OR EXISTS(SELECT 1 FROM question_module_links WHERE module_type='paper_question' AND module_record_id=? AND (canonical_question_id<>? OR observed_source_hash<>?))` ).bind(crypto.randomUUID(),item.file_id,canonicalId,scope.id,r.identityHash,r.normalizedText,stableJSON(r.identity),q.id,q.revision,q.updated_at,q.image_key,q.regions,q.question_text,q.status,q.classification,item.source_document_id,scope.id,paper.id,paper.file_hash,paper.source_key,q.id,canonicalId,r.observedHash));
 const occurrenceId=crypto.randomUUID();
 statements.push(db.prepare(`INSERT INTO question_occurrences(id,canonical_question_id,content_revision_id,source_document_id,source_type,occurrence_key,question_number,page,source_locator_json,image_key,original_filename,raw_text,occurrence_hash,metadata,mapping_status) SELECT ?,?,?,?,'math_paper',?,?,?,?,?,?,?,?,?,'confirmed' WHERE NOT EXISTS(SELECT 1 FROM question_occurrences WHERE source_document_id=? AND occurrence_key=?)`).bind(occurrenceId,canonicalId,revisionId,item.source_document_id,'paper_question:'+q.id,String(q.question_number),Math.min(...regions.map((x:{page:number})=>x.page)),stableJSON({paper_id:q.paper_id,paper_question_id:q.id,question_number:q.question_number,regions}),q.image_key,paper.original_filename,q.question_text,r.imageHash,stableJSON({import_stage:'3A',human_review:decision}),item.source_document_id,'paper_question:'+q.id));
 statements.push(db.prepare(`INSERT INTO question_module_links(id,module_type,module_record_id,canonical_question_id,occurrence_id,legacy_paper_question_id,observed_source_hash) SELECT ?,'paper_question',?,?,(SELECT id FROM question_occurrences WHERE source_document_id=? AND occurrence_key=? AND canonical_question_id=?),?,? WHERE NOT EXISTS(SELECT 1 FROM question_module_links WHERE module_type='paper_question' AND module_record_id=?)`).bind(crypto.randomUUID(),q.id,canonicalId,item.source_document_id,'paper_question:'+q.id,canonicalId,q.id,r.observedHash,q.id));
 statements.push(db.prepare(`UPDATE paper_import_items SET status=CASE WHEN EXISTS(SELECT 1 FROM canonical_question_revisions WHERE id=? AND json_extract(payload,'$.human_review.review_notes')=?) THEN 'NEW' ELSE 'DUPLICATE' END,canonical_id=?,reason=?,decision=? WHERE id=?`).bind(revisionId,decision.review_notes,canonicalId,'人工 READY 确认后安全关联；同 scope 完整身份重复时复用 Canonical，并保留本来源 occurrence。',JSON.stringify(decision),itemId));
 await db.batch(statements);
 assert.ok(await db.prepare('SELECT id FROM question_module_links WHERE module_record_id=? AND canonical_question_id=?').bind(q.id,canonicalId).first());
}

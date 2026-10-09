import { DatabaseSync } from 'node:sqlite';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { backupProject, assertStopped, inspectDatabase } from './project-data.mjs';
import { capturePaperReviewState } from './preview-paper-canonical-mapping.mjs';
import { validateCanonicalIdentityDecision } from '../lib/canonical-identity-decision.mjs';
import { sha256, prepareReadyRecord, resolveProjectPrivateScope, businessSnapshot, identitySnapshot, planCanonicalPaperImport, importCanonicalPaperTransaction, verifyReadyMappings } from '../lib/canonical-paper-import.mjs';

const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(root,'../outputs'),work=path.resolve(root,'../work');
// Fixed ten-record batch: applicability comes from the supplied reviewed texts/figures,
// under the user's explicit human completeness confirmation. No AI or heuristics API.
export const APPLICABILITY = Object.freeze({
  '0d2c5500-aab0-4099-a06d-680d444b2af8':{formula:true,options:false,subquestions:false,visual:false,cross_page:true},
  '8012fb6c-ecaa-4c0b-a032-a6b90ed57f0d':{formula:true,options:true,subquestions:false,visual:false,cross_page:true},
  'e878af8d-b712-4380-a1af-28015c7d712e':{formula:false,options:false,subquestions:false,visual:false,cross_page:true},
  '58ad5e46-ebc0-4cbf-a029-f99d6142af78':{formula:true,options:false,subquestions:true,visual:false,cross_page:true},
  'fa35a5f7-9489-47dd-9786-75c9728a4c33':{formula:true,options:false,subquestions:true,visual:true,cross_page:true},
  '018ad38a-8b22-49c9-82c6-b11f573ef75c':{formula:true,options:false,subquestions:false,visual:false,cross_page:false},
  'c47e7c65-f0cc-4633-8577-ea4f4212a2b0':{formula:true,options:true,subquestions:false,visual:false,cross_page:false},
  '6fb731db-a761-4d6a-b746-5d2adc7b4b68':{formula:true,options:true,subquestions:false,visual:true,cross_page:false},
  '6c8b21d3-d1d0-4d61-8269-4a657a0c8e16':{formula:true,options:false,subquestions:true,visual:false,cross_page:false},
  '5f25b747-d2cc-4ac1-bc18-816915d24fc5':{formula:true,options:false,subquestions:false,visual:false,cross_page:false},
});
export function finalizeHumanDecision(d,scope,reviewedAt) {
  assert.ok(APPLICABILITY[d.paper_question_id],'Only the authorized ten sample IDs may be imported');
  const next=structuredClone(d),app=APPLICABILITY[d.paper_question_id];
  next.decision_origin='human';next.review_status='READY';next.reviewer='project_owner';next.reviewed_at=reviewedAt;
  next.applicability={...app};next.text_complete=true;next.regions_complete=true;next.source_confirmed=true;
  for(const [key,field] of Object.entries({formula:'formula_complete',options:'options_complete',subquestions:'subquestions_complete',visual:'visual_complete',cross_page:'cross_page_complete'})) next[field]=app[key]?true:'not_applicable';
  next.scope_decision={status:'confirmed',scope_id:scope.id,scope_code:scope.code,scope_type:scope.scope_type,kind:scope.kind,ownership_status:scope.ownership_status,owner_principal_id:scope.owner_principal_id,
    decision_basis:'用户明确确认十道样本身份内容完整，并授权作为本人项目私有题库数据首次落库；不授权公开。',authorization_evidence:''};
  next.missing_reasons=[];next.review_notes='2E-Final：依据用户人工确认登记为 READY，适用性按本批题干与必要图形结构填写；跨页按照原 regions 多页记录确认，空白续页片段原样保留。';
  const result=validateCanonicalIdentityDecision(next);assert.equal(result.valid,true,JSON.stringify(result.errors));return next;
}
const zeroWrites = counts => ['question_library_scopes','canonical_questions','canonical_question_revisions','source_documents','question_occurrences','question_module_links'].every(t=>counts[t]===0);

export async function finalizeCanonicalPaperImport() {
  await assertStopped(root);
  const stamp=new Date().toISOString(),runId=stamp.replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
  const runDirectory=path.join(work,'canonical-final',runId);await fs.mkdir(runDirectory,{recursive:true});
  const decisionFile=path.join(output,'阶段2E-3-canonical-identity-decisions.json');
  const originalDecisionBytes=await fs.readFile(decisionFile),input=JSON.parse(originalDecisionBytes);
  assert.equal(input.decisions.length,10);assert.equal(new Set(input.decisions.map(d=>d.paper_question_id)).size,10);
  assert.deepEqual([...input.decisions.map(d=>d.paper_question_id)].sort(),Object.keys(APPLICABILITY).sort());
  const materials=JSON.parse(await fs.readFile(path.join(output,'阶段2E-3-canonical-review-materials.json'),'utf8'));
  const before=await capturePaperReviewState(root,undefined,{requireEmpty:false});
  const paperMap=new Map(before.papers.map(p=>[p.id,p])),questionMap=new Map(before.questions.map(q=>[q.id,q]));
  const hashR2Object = async key => {
    const matches=before.objects.filter(o=>o.key===key);assert.equal(matches.length,1,'Ambiguous/missing R2 mapping');
    const files=Object.keys(before.files.r2_objects_mapping_and_wal).filter(file=>file.endsWith('/blobs/'+matches[0].blob_id));assert.equal(files.length,1);
    const bytes=await fs.readFile(path.resolve(root,files[0]));assert.equal(bytes.length,matches[0].size);
    const hash=sha256(bytes);assert.equal(hash,before.files.r2_objects_mapping_and_wal[files[0]]);return hash;
  };
  let scope,expectedBusiness,expectedIdentity;
  const initial=new DatabaseSync(before.database,{readOnly:true});
  try {scope=resolveProjectPrivateScope(initial);expectedBusiness=businessSnapshot(initial);expectedIdentity=identitySnapshot(initial);} finally {initial.close();}
  // Repeated invocation preserves the existing recorded human review time when already finalized.
  const decisions=input.decisions.map(d=>finalizeHumanDecision(d,scope,d.decision_origin==='human'&&d.review_status==='READY'?d.reviewed_at:stamp));
  const records=[];
  for(const decision of decisions) {
    const q=questionMap.get(decision.paper_question_id),paper=paperMap.get(decision.paper_id);assert.ok(q&&paper);
    const material=materials.items.find(i=>i.paper_question_id===q.id);assert.ok(material);
    assert.equal(q.question_text,material.question_text);assert.equal(q.regions,material.regions_raw);assert.equal(q.classification,material.classification_raw);
    assert.equal(q.image_key,material.image_file_reference.storage_key);assert.equal(paper.source_key,material.source_file_reference.storage_key);
    const imageHash=await hashR2Object(q.image_key),sourceHash=await hashR2Object(paper.source_key);
    assert.equal(imageHash,material.artifacts.current_image.sha256,'Reviewed image changed');assert.equal(sourceHash,material.artifacts.source_file.sha256,'Reviewed source changed');
    const record=prepareReadyRecord({question:q,paper,decision,imageHash,sourceHash});assert.equal(record.textHash,material.normalized_text_hash,'2D/2E-1 text hash changed');records.push(record);
  }
  const dryDb=new DatabaseSync(before.database,{readOnly:true});let dryRun;
  try {dryRun=planCanonicalPaperImport(dryDb,records,scope);} finally {dryDb.close();}
  await fs.writeFile(path.join(runDirectory,'dry-run.json'),JSON.stringify(dryRun,null,2),{flag:'wx'});
  console.log('Dry-run PASS:',JSON.stringify(dryRun.counts));
  console.log('Checks: source-document dedup; full identity hash + payload equality; private scope; TEXT module IDs; occurrence/source references.');
  // Reuse the existing stage 2A consistent snapshot/manifest backup implementation unchanged.
  const backup=await backupProject({root,output:path.join(work,'backups')});
  console.log('Pre-write backup verified:',backup.directory);
  const afterBackup=await capturePaperReviewState(root,before.database,{requireEmpty:false});assert.deepEqual(afterBackup,before,'Data drifted before transaction');
  let first,second,verified,businessAfter,secondUnchanged;
  const db=new DatabaseSync(before.database);
  try {
    db.exec('PRAGMA foreign_keys=ON');
    first=importCanonicalPaperTransaction(db,records,scope,{expectedBusiness,expectedIdentity,beforeCommit:plan=>assert.deepEqual(plan.counts,dryRun.counts)});
    const firstState=identitySnapshot(db);
    second=importCanonicalPaperTransaction(db,records,scope,{expectedBusiness,expectedIdentity:firstState,beforeCommit:plan=>assert.ok(zeroWrites(plan.counts),'Second run must create no rows')});
    assert.ok(zeroWrites(second.counts));assert.deepEqual(identitySnapshot(db),firstState,'Second run changed existing canonical rows');secondUnchanged=true;
    verified=verifyReadyMappings(db,records,scope);assert.equal(verified.length,10);businessAfter=businessSnapshot(db);assert.deepEqual(businessAfter,expectedBusiness);
  } finally {db.close();}
  const after=await capturePaperReviewState(root,before.database,{requireEmpty:false});
  assert.deepEqual(after.papers,before.papers);assert.deepEqual(after.questions,before.questions);assert.deepEqual(after.tables,before.tables);
  assert.deepEqual(after.objects,before.objects);assert.deepEqual(after.files.r2_objects_mapping_and_wal,before.files.r2_objects_mapping_and_wal,'R2 changed');
  const integrity=inspectDatabase(before.database);assert.equal(integrity.integrity,'ok');assert.equal(integrity.foreignKeyErrors,0);
  await fs.writeFile(path.join(runDirectory,'original-decisions.json'),originalDecisionBytes,{flag:'wx'});
  // Archive previous acceptance reports, if this exact flow is explicitly re-run later.
  for(const name of ['阶段2E-Final-canonical-import.json','阶段2E-Final-canonical-import.md']) {
    const old=await fs.readFile(path.join(output,name)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(old) await fs.writeFile(path.join(runDirectory,'previous-'+name),old,{flag:'wx'});
  }
  const report={stage:'2E-Final',completed_at:new Date().toISOString(),decision_count:10,READY:10,scope,
    backup_directory:backup.directory,run_directory:runDirectory,dry_run_counts:dryRun.counts,first_run:first,second_run:second,
    verified_mappings:verified,applicability:decisions.map(d=>({paper_question_id:d.paper_question_id,...d.applicability})),
    acceptance:{decisions_valid:decisions.every(d=>validateCanonicalIdentityDecision(d).valid),linked:verified.length,canonical_reverse_lookup:verified.length,source_reverse_lookup:verified.length,
      normalized_text_hash_unchanged:true,scope_non_public:true,second_run_zero_writes:zeroWrites(second.counts),second_run_existing_rows_unchanged:secondUnchanged,
      all_legacy_table_rows_and_schema_unchanged:true,papers_unchanged:true,paper_questions_unchanged:true,r2_unchanged:true,integrity:'ok',foreign_key_errors:0,ai_calls:0},
    table_counts_before:before.counts,table_counts_after:after.counts,legacy_before:expectedBusiness,legacy_after:businessAfter,
    r2_fingerprints_before:before.files.r2_objects_mapping_and_wal,r2_fingerprints_after:after.files.r2_objects_mapping_and_wal,r2_objects_before:before.objects.length,r2_objects_after:after.objects.length,
    hash_rules:{normalized_text_hash:'Original math-paper-text-v1 SHA-256 retained in revision payload',revision_normalized_hash:'SHA-256 of stable complete identity JSON; required visual image bytes included; provenance and review time excluded',dedup_scope:'Same private scope only; hash AND exact identity JSON equality'},
    next_stage:'批量 PDF 导入 MVP；本脚本仅支持本批授权十题，不是批量导入工具'};
  await fs.writeFile(decisionFile,JSON.stringify({...input,stage:'2E-Final',reviewed:true,decisions},null,2));
  await fs.writeFile(path.join(output,'阶段2E-Final-canonical-import.json'),JSON.stringify(report,null,2));
  const lines=['# 阶段 2E-Final：Canonical 首次真实落库验收','',`10/10 human READY；scope=${scope.code}，${scope.scope_type} / ${scope.kind}，owner=${scope.owner_principal_id}。没有公共授权。`,'',
    '| 表 | 首次新增 | 立即第二次新增 |','|---|---:|---:|',...['question_library_scopes','canonical_questions','canonical_question_revisions','source_documents','question_occurrences','question_module_links'].map(t=>`| ${t} | ${first.counts[t]} | ${second.counts[t]} |`),'',
    `备份：${backup.directory}`,'',`dry-run 与原 decision 快照：${runDirectory}`,'',
    '## 双向查询映射','', '| 旧题 ID | canonical | revision | occurrence | source document |','|---|---|---|---|---|',...verified.map(m=>`| ${m.paper_question_id} | ${m.canonical_id} | ${m.revision_id} | ${m.occurrence_id} | ${m.source_document_id} |`),'',
    '## 适用性','', '| 旧题 ID | 公式 | 选项 | 小问 | 必要图形 | 跨页 |','|---|---|---|---|---|---|',...decisions.map(d=>`| ${d.paper_question_id} | ${d.applicability.formula} | ${d.applicability.options} | ${d.applicability.subquestions} | ${d.applicability.visual} | ${d.applicability.cross_page} |`),'',
    '原文字 hash 完整保留于 payload.normalized_text_hash；revision.normalized_hash 遵守 2B/2C 完整身份规则。带必要图形题用当前题图字节 SHA-256 作为保守身份组成；不承诺识别不同截图渲染的等价图形。','',
    '全部旧表逐行 hash、schema 及行数保持一致；papers、paper_questions 未改；R2 映射/二进制/WAL 指纹一致；外键和 SQLite integrity_check 通过。第二次事务新增 0，已有 Canonical 行也未变。','',
    '备份机制、schema、migration、API、UI 均未重构。只迁入本批十题；其余十四题未建立 module link。本步骤结束阶段 2，下一阶段进入批量 PDF 导入 MVP，不继续拆审核子阶段。',''];
  await fs.writeFile(path.join(output,'阶段2E-Final-canonical-import.md'),lines.join('\n'));
  console.log(JSON.stringify({first:first.counts,second:second.counts,acceptance:report.acceptance,backup:backup.directory,report:path.join(output,'阶段2E-Final-canonical-import.json')},null,2));
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {await finalizeCanonicalPaperImport();} catch(error){console.error('Canonical final import FAILED:',error.stack);process.exitCode=1;}
}

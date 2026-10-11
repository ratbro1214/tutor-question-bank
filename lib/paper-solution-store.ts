import { z } from 'zod';
import { proposeMatch, solutionEntrySchema, solutionPageSchema, splitSolutions, cleanOCRPages, LOCAL_SOLUTION_VERSION, SOLUTION_VERSION, solutionReviewSchema, type MatchQuestion, type SolutionEntry } from './paper-solutions';

export class SolutionError extends Error { constructor(message:string,public status=409){super(message);} }
export type SolutionSource={id:string;paper_id:string;batch_id:string;scope_id:string;owner_id:string;filename:string;storage_key:string;file_hash:string;status:string;version:string;pages:string|null;error:string;created_at:string};
export type StoredSolution={id:string;source_id:string;entry_key:string;data:string;question_id:string|null;status:string;proposal:string;revision:number;question_snapshot:string;teacher_text:string|null;reviewer:string|null;updated_at:string};
export type StoredReview={id:string;entry_id:string;match_revision:number;operation_id:string;mode:string;status:string;input:string;result:string|null;teacher_result:string|null;teacher_status:string;model:string;prompt_version:string;elapsed_ms:number;error:string;created_at:string;updated_at:string};
export const matchWriteSchema=z.object({operationId:z.string().uuid(),expectedRevision:z.number().int().positive(),questionId:z.string().uuid().nullable(),teacherText:z.string().max(60000).nullable(),confirm:z.boolean()}).strict();

export class SolutionStore {
 constructor(public db:D1Database,public owner:string,public scopes:string[],public legacyScope:string|null=null){}
 async paper(id:string) {
  if(!z.string().uuid().safeParse(id).success)throw new SolutionError('试卷不存在或无权访问。',404);
  const paper=await this.db.prepare('SELECT * FROM papers WHERE id=?').bind(id).first<{id:string;title:string;source_key:string;source_type:string;file_hash:string;original_filename:string}>();
  const sources=(await this.db.prepare('SELECT scope_id FROM source_documents WHERE math_paper_id=?').bind(id).all<{scope_id:string}>()).results;
  if(!paper||(!sources.length&&!this.legacyScope)||sources.some(s=>!this.scopes.includes(s.scope_id)))throw new SolutionError('试卷不存在或无权访问。',404);
  return {...paper,scopeId:sources[0]?.scope_id||this.legacyScope!};
 }
 async source(paperId:string,id:string) {
  await this.paper(paperId);
  const s=await this.db.prepare('SELECT * FROM paper_solution_sources WHERE id=? AND paper_id=? AND owner_id=?').bind(id,paperId,this.owner).first<SolutionSource>();
  if(!s||!this.scopes.includes(s.scope_id))throw new SolutionError('解析来源不存在或无权访问。',404);
  return s;
 }
 async questions(paperId:string):Promise<MatchQuestion[]> {
  const rows=(await this.db.prepare('SELECT * FROM paper_questions WHERE paper_id=? ORDER BY question_number').bind(paperId).all<MatchQuestionRow>()).results;
  return rows.map(matchQuestionRow);
 }
 async list(paperId:string) {
  await this.paper(paperId);
  const sources=(await this.db.prepare('SELECT * FROM paper_solution_sources WHERE paper_id=? AND owner_id=? ORDER BY created_at').bind(paperId,this.owner).all<SolutionSource>()).results.filter(s=>this.scopes.includes(s.scope_id));
  const entries:StoredSolution[]=[];const reviews:StoredReview[]=[];
  for(const s of sources){entries.push(...(await this.db.prepare("SELECT e.*,m.question_id,m.status,m.proposal,m.revision,m.question_snapshot,m.teacher_text,m.reviewer,m.updated_at FROM paper_solution_entries e JOIN paper_solution_matches m ON m.entry_id=e.id WHERE e.source_id=? AND (?<>? OR e.entry_key LIKE 'local-v2:%' OR e.entry_key LIKE 'manual:%') ORDER BY e.rowid").bind(s.id,s.version,LOCAL_SOLUTION_VERSION).all<StoredSolution>()).results);
   reviews.push(...(await this.db.prepare('SELECT r.* FROM paper_solution_reviews r JOIN paper_solution_entries e ON e.id=r.entry_id WHERE e.source_id=? ORDER BY r.created_at').bind(s.id).all<StoredReview>()).results);}
  return {sources:sources.map(({storage_key:_key,pages:_pages,...s})=>({...s,url:`/api/papers/${paperId}/solutions/${s.id}/file`})),entries:entries.map(e=>({...e,data:JSON.parse(e.data),proposal:JSON.parse(e.proposal)})),reviews:reviews.map(r=>({...r,result:r.result?JSON.parse(r.result):null,teacher_result:r.teacher_result?JSON.parse(r.teacher_result):null})),questions:await this.questions(paperId)};
 }
 async createSource(paperId:string,input:{id:string;hash:string;key:string;filename:string}) {
  const p=await this.paper(paperId),old=await this.db.prepare('SELECT * FROM paper_solution_sources WHERE paper_id=? AND owner_id=? AND file_hash=?').bind(paperId,this.owner,input.hash).first<SolutionSource>();
  if(old)return old;
  const batch=crypto.randomUUID(),now=new Date().toISOString();
  await this.db.batch([
   this.db.prepare("INSERT INTO paper_import_batches(id,scope_id,status,created_at) VALUES(?,?,'processing',?)").bind(batch,p.scopeId,now),
   this.db.prepare("INSERT INTO paper_import_files(id,batch_id,position,filename,status,paper_id) VALUES(?,?,0,?,'processing',?)").bind(crypto.randomUUID(),batch,p.original_filename,p.id),
   this.db.prepare("INSERT INTO paper_solution_sources(id,paper_id,batch_id,scope_id,owner_id,filename,storage_key,file_hash,status,version,created_at) VALUES(?,?,?,?,?,?,?,?,'uploaded',?,?)").bind(input.id,p.id,batch,p.scopeId,this.owner,input.filename,input.key,input.hash,SOLUTION_VERSION,now)
  ]);
  return this.source(paperId,input.id);
 }
 async extract(paperId:string,sourceId:string,raw:unknown) {
  const s=await this.source(paperId,sourceId);
  const local=z.object({method:z.literal('local_ocr'),pages:z.array(solutionPageSchema).min(1).max(80)}).strict().safeParse(raw);
  if(s.status==='ready'&&(!local.success||s.version===LOCAL_SOLUTION_VERSION))return this.list(paperId);
  const pages=local.success?cleanOCRPages(local.data.pages):z.array(solutionPageSchema).min(1).max(80).parse(raw);
  if(new Set(pages.map(p=>p.page)).size!==pages.length||pages.some((p,i)=>p.page!==i+1))throw new SolutionError('解析页码必须完整连续。',400);
  const entries=splitSolutions(pages);
  if(!entries.length)throw new SolutionError('未识别可用文字。扫描版请在审核页手动补充，原文件保留。',422);
  if(local.success&&!entries.some(e=>e.number))throw new SolutionError('本地识别未找到明确题号，未保存不可靠切割。',422);
  const repair=local.success&&s.status==='ready';
  if(repair&&await this.db.prepare('SELECT 1 AS found FROM paper_solution_matches m JOIN paper_solution_entries e ON e.id=m.entry_id WHERE e.source_id=? AND (m.reviewer IS NOT NULL OR m.status=\'CONFIRMED\') LIMIT 1').bind(s.id).first())throw new SolutionError('此来源已有教师审核，请保留原审核结果；重新切割需上传独立解析来源。');
  const questions=await this.questions(paperId),now=new Date().toISOString(),statements:D1PreparedStatement[]=[];
  if(repair)statements.push(this.db.prepare("UPDATE paper_solution_sources SET status='CONFLICT' WHERE id=? AND EXISTS(SELECT 1 FROM paper_solution_matches m JOIN paper_solution_entries e ON e.id=m.entry_id WHERE e.source_id=? AND (m.reviewer IS NOT NULL OR m.status='CONFIRMED'))").bind(s.id,s.id));
  for(const e of entries){const id=crypto.randomUUID(),proposal=proposeMatch(e,questions,entries),q=questions.find(q=>q.id===proposal.questionId);
   const key=local.success?'local-v2:'+e.key:e.key;
   statements.push(this.db.prepare('INSERT OR IGNORE INTO paper_solution_entries(id,source_id,entry_key,data) VALUES(?,?,?,?)').bind(id,s.id,key,JSON.stringify(e)));
   statements.push(this.db.prepare('INSERT OR IGNORE INTO paper_solution_matches(entry_id,question_id,status,proposal,question_snapshot,updated_at) SELECT id,?,?,?,?,? FROM paper_solution_entries WHERE source_id=? AND entry_key=?').bind(proposal.questionId,proposal.status,JSON.stringify(proposal),q?JSON.stringify(q):'',now,s.id,key));
  }
  statements.push(this.db.prepare("UPDATE paper_solution_sources SET status='ready',pages=?,error='',version=? WHERE id=?").bind(JSON.stringify(pages),local.success?LOCAL_SOLUTION_VERSION:SOLUTION_VERSION,s.id));
  statements.push(this.db.prepare("UPDATE paper_import_files SET status='completed' WHERE batch_id=?").bind(s.batch_id));
  statements.push(this.db.prepare("UPDATE paper_import_batches SET status='completed' WHERE id=?").bind(s.batch_id));
  await this.db.batch(statements);return this.list(paperId);
 }
 async entry(paperId:string,id:string) {
  const e=await this.db.prepare('SELECT e.*,m.question_id,m.status,m.proposal,m.revision,m.question_snapshot,m.teacher_text,m.reviewer,m.updated_at FROM paper_solution_entries e JOIN paper_solution_matches m ON m.entry_id=e.id WHERE e.id=?').bind(id).first<StoredSolution>();
  if(!e)throw new SolutionError('解析条目不存在。',404);const source=await this.source(paperId,e.source_id);
  if(source.version===LOCAL_SOLUTION_VERSION&&!e.entry_key.startsWith('local-v2:')&&!e.entry_key.startsWith('manual:'))throw new SolutionError('此条目属于保留的旧提取记录，请刷新后审核当前切割结果。');return e;
 }
 // This CHECK guard causes D1.batch to roll back if another request changed the match.
 guard(e:StoredSolution) { return this.db.prepare("UPDATE paper_solution_sources SET status='CONFLICT' WHERE id=? AND (NOT EXISTS(SELECT 1 FROM paper_solution_matches WHERE entry_id=? AND revision=?) OR (version=? AND ? NOT LIKE 'local-v2:%' AND ? NOT LIKE 'manual:%'))").bind(e.source_id,e.id,e.revision,LOCAL_SOLUTION_VERSION,e.entry_key,e.entry_key); }
 questionGuard(q:MatchQuestion,sourceId:string){return this.db.prepare("UPDATE paper_solution_sources SET status='CONFLICT' WHERE id=? AND NOT EXISTS(SELECT 1 FROM paper_questions WHERE id=? AND revision=? AND question_text=? AND regions=? AND image_key=? AND updated_at=?)").bind(sourceId,q.id,q.revision,q.text,JSON.stringify(q.regions),q.imageKey!,q.updatedAt!);}
 async writeMatch(paperId:string,id:string,raw:unknown) {
  const input=matchWriteSchema.parse(raw),e=await this.entry(paperId,id);
  const prior=await this.db.prepare('SELECT snapshot FROM paper_solution_match_history WHERE entry_id=? AND operation_id=?').bind(id,input.operationId).first<{snapshot:string}>();
  if(prior){if(JSON.parse(prior.snapshot).request!==JSON.stringify(input))throw new SolutionError('操作编号已用于不同修改。');return this.list(paperId);}
  if(e.revision!==input.expectedRevision)throw new SolutionError('解析匹配已更新，请刷新再审核。');
  const q=input.questionId?(await this.questions(paperId)).find(q=>q.id===input.questionId):null;
  if(input.questionId&&!q)throw new SolutionError('对应题目不属于本试卷。',400);
  if(input.confirm&&!q)throw new SolutionError('先指定对应题目再确认。',400);
  const status=input.confirm?'CONFIRMED':q?'NEEDS_REVIEW':'UNMATCHED',now=new Date().toISOString();
  const snapshot={request:JSON.stringify(input),questionId:q?.id||null,status,teacherText:input.teacherText,questionSnapshot:q,original:JSON.parse(e.data),previous:e};
  await this.db.batch([this.guard(e),...(q?[this.questionGuard(q,e.source_id)]:[]),this.db.prepare('INSERT INTO paper_solution_match_history(id,entry_id,revision,operation_id,snapshot,reviewer,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,e.revision+1,input.operationId,JSON.stringify(snapshot),this.owner,now),
   this.db.prepare('UPDATE paper_solution_matches SET question_id=?,status=?,revision=revision+1,teacher_text=?,question_snapshot=?,reviewer=?,updated_at=? WHERE entry_id=? AND revision=?').bind(q?.id||null,status,input.teacherText,q?JSON.stringify(q):'',this.owner,now,id,e.revision)]);
  return this.list(paperId);
 }
 async manual(paperId:string,sourceId:string,raw:unknown) {
  const s=await this.source(paperId,sourceId),input=z.object({operationId:z.string().uuid(),entry:solutionEntrySchema}).strict().parse(raw),entry:SolutionEntry={...input.entry,key:'manual:'+input.operationId};
  const old=await this.db.prepare('SELECT id FROM paper_solution_entries WHERE source_id=? AND entry_key=?').bind(s.id,entry.key).first<{id:string}>();
  if(old)return this.list(paperId);
  const id=crypto.randomUUID();entry.warnings=[...entry.warnings,'教师手动补充，内容并非自动提取的来源原文。'];
  await this.db.batch([this.db.prepare('INSERT INTO paper_solution_entries(id,source_id,entry_key,data) VALUES(?,?,?,?)').bind(id,s.id,entry.key,JSON.stringify(entry)),
   this.db.prepare("INSERT INTO paper_solution_matches(entry_id,status,proposal,updated_at) VALUES(?,'UNMATCHED',?,?)").bind(id,JSON.stringify({version:SOLUTION_VERSION,reasons:entry.warnings,candidates:[],level:'low'}),new Date().toISOString())]);return this.list(paperId);
 }
 async rematch(paperId:string,sourceId:string){
  const s=await this.source(paperId,sourceId);const questions=await this.questions(paperId);
  const rows=(await this.db.prepare("SELECT e.*,m.question_id,m.status,m.proposal,m.revision,m.question_snapshot,m.teacher_text,m.reviewer,m.updated_at FROM paper_solution_entries e JOIN paper_solution_matches m ON m.entry_id=e.id WHERE e.source_id=? AND (?<>? OR e.entry_key LIKE 'local-v2:%' OR e.entry_key LIKE 'manual:%')").bind(sourceId,s.version,LOCAL_SOLUTION_VERSION).all<StoredSolution>()).results;
  const entries=rows.map(e=>JSON.parse(e.data) as SolutionEntry),now=new Date().toISOString();
  for(const e of rows.filter(e=>!e.reviewer&&e.status!=='CONFIRMED')){
   const proposal=proposeMatch(JSON.parse(e.data),questions,entries),q=questions.find(q=>q.id===proposal.questionId);
   await this.db.batch([this.guard(e),...(q?[this.questionGuard(q,sourceId)]:[]),this.db.prepare('UPDATE paper_solution_matches SET question_id=?,status=?,proposal=?,revision=revision+1,question_snapshot=?,updated_at=? WHERE entry_id=? AND revision=? AND reviewer IS NULL').bind(proposal.questionId,proposal.status,JSON.stringify(proposal),q?JSON.stringify(q):'',now,e.id,e.revision)]);
  }return this.list(paperId);
 }
 async reviewDecision(paperId:string,id:string,raw:unknown){
  const input=z.object({decision:z.enum(['accepted','rejected']),result:solutionReviewSchema.optional()}).strict().parse(raw);
  const r=await this.db.prepare('SELECT * FROM paper_solution_reviews WHERE id=?').bind(id).first<StoredReview>();
  if(!r)throw new SolutionError('评审不存在。',404);const e=await this.entry(paperId,r.entry_id);
  const q=(await this.questions(paperId)).find(q=>q.id===e.question_id);
  if(r.status!=='completed'||e.status!=='CONFIRMED'||r.match_revision!==e.revision||JSON.stringify(q)!==e.question_snapshot)throw new SolutionError('匹配或题目已变化，请重新确认并评审。');
  if(r.teacher_status!=='pending')throw new SolutionError('评审已处理；原决定保留。');
  await this.db.batch([this.guard(e),this.questionGuard(q!,e.source_id),this.db.prepare('UPDATE paper_solution_reviews SET teacher_status=?,teacher_result=?,updated_at=? WHERE id=? AND teacher_status=\'pending\'').bind(input.decision,input.result?JSON.stringify(input.result):null,new Date().toISOString(),id)]);
  return this.list(paperId);
 }
}
export type MatchQuestionRow={id:string;question_number:number;question_text:string;classification:string|null;revision:number;regions:string;image_key:string;updated_at:string};
export function matchQuestionRow(q:MatchQuestionRow):MatchQuestion{return {id:q.id,number:q.question_number,text:q.question_text,type:q.classification?JSON.parse(q.classification).question_type:'',educationStage:q.classification?JSON.parse(q.classification).education_stage:'',revision:q.revision,regions:JSON.parse(q.regions),imageKey:q.image_key,updatedAt:q.updated_at};}

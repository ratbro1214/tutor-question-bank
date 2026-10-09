import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { attachPaper,registerItem,confirmItem,batchResult } from '../lib/paper-batch-server';
import { sha256 } from '../lib/canonical-paper-import.mjs';
import type { ReviewApplication } from '../lib/paper-batch';

// Execute the actual D1 statement batches against SQLite, with rollback on any statement failure.
function fixture() {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+name,'utf8'));
 sql.exec("INSERT INTO question_library_scopes(id,code,name,scope_type,kind,owner_principal_id,ownership_status) VALUES('scope','project-private','private','legacy_private','private','project_owner','known')");
 class Statement {
  args:unknown[]=[];constructor(public query:string){}
  bind(...args:unknown[]){this.args=args;return this;}
  async first(){return sql.prepare(this.query).get(...this.args as never[])||null;}
  async all(){return {results:sql.prepare(this.query).all(...this.args as never[])};}
  async run(){return {meta:sql.prepare(this.query).run(...this.args as never[])};}
 }
 let beforeBatch:(()=>void)|undefined;
 const db={prepare:(query:string)=>new Statement(query),async batch(statements:Statement[]){beforeBatch?.();sql.exec('BEGIN IMMEDIATE');try{const rows=[];for(const s of statements)rows.push({meta:sql.prepare(s.query).run(...s.args as never[])});sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const bytes=new Map<string,Uint8Array>();
 const bucket={async head(key:string){return bytes.has(key)?{key}:null;},async get(key:string){const value=bytes.get(key);return value?{arrayBuffer:async()=>value.slice().buffer}:null;}} as unknown as R2Bucket;
 const batch=()=>{const id=crypto.randomUUID();sql.prepare('INSERT INTO paper_import_batches(id,scope_id) VALUES(?,?)').run(id,'scope');return id;};
 const file=(batchId:string,paperId='p',position=0)=>{const id=crypto.randomUUID();sql.prepare('INSERT INTO paper_import_files(id,batch_id,position,filename) VALUES(?,?,?,?)').run(id,batchId,position,paperId+'.pdf');return id;};
 const question=(paperId:string,number:number,text='Solve 2x+4=10',image='image',regions=[{page:1,x:0,y:0,width:1,height:1}])=>{
  const source=new TextEncoder().encode('pdf:'+paperId);bytes.set('source:'+paperId,source);
  sql.prepare('INSERT OR IGNORE INTO papers(id,title,original_filename,source_key,source_type,file_hash,created_at) VALUES(?,?,?,?,?,?,?)').run(paperId,paperId,paperId+'.pdf','source:'+paperId,'application/pdf',sha256(source),'2026-10-07');
  const id=crypto.randomUUID();bytes.set('image:'+id,new TextEncoder().encode(image));
  sql.prepare('INSERT INTO paper_questions(id,paper_id,question_number,regions,image_key,question_text,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,paperId,number,JSON.stringify(regions),'image:'+id,number+'. '+text,'2026-10-07');return id;
 };
 const register=async(batchId:string,fileId:string,qid:string,number:number)=>{await registerItem(db,bucket,batchId,fileId,{number,questionId:qid});return (await batchResult(db,batchId)).files.find(f=>f.id===fileId)!.items.find(i=>i.question_number===number)!;};
 const plain:ReviewApplication={formula:true,options:false,subquestions:false,visual:false,cross_page:false};
 return {sql,db,bucket,bytes,batch,file,question,register,plain,setBeforeBatch:(fn:()=>void)=>{beforeBatch=fn;},close:()=>sql.close()};
}
test('three PDFs produce independent items, scoped text duplicates and failed items; unreviewed single/cross-page/visual items never enter canonical',async()=>{
 const f=fixture();try {
  const batch=f.batch();
  for(let n=0;n<3;n++) {
   const id=f.question('p'+n,1),file=f.file(batch,'p'+n,n);await attachPaper(f.db,batch,file,'p'+n);
   const item=await f.register(batch,file,id,1);assert.equal(item.status,'NEEDS_REVIEW');assert.ok(item.text_hash);
   if(n)assert.ok(item.duplicate_item_id);
   await registerItem(f.db,f.bucket,batch,file,{number:2,error:'crop failed'});
  }
  const result=await batchResult(f.db,batch);assert.equal(result.counts.pdfs,3);assert.equal(result.counts.questions,6);assert.equal(result.counts.NEEDS_REVIEW,3);assert.equal(result.counts.FAILED,3);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM canonical_questions').get()!.n,0);
 }finally{f.close();}
});
test('explicit human READY creates graph, equal text reuses identity with separate occurrence, repeats create zero canonical/source/link rows',async()=>{
 const f=fixture();try {
  const batch=f.batch(),q=f.question('p',1),file=f.file(batch);await attachPaper(f.db,batch,file,'p');const item=await f.register(batch,file,q,1);
  await confirmItem(f.db,f.bucket,batch,item.id,f.plain,item.observed_hash!);
  const first=(await batchResult(f.db,batch)).files[0].items[0];assert.equal(first.status,'NEW');assert.ok(first.canonical_id);
  await confirmItem(f.db,f.bucket,batch,item.id,f.plain,item.observed_hash!);
  const q2=f.question('p2',1),file2=f.file(batch,'p2',1);await attachPaper(f.db,batch,file2,'p2');const item2=await f.register(batch,file2,q2,1);
  await confirmItem(f.db,f.bucket,batch,item2.id,f.plain,item2.observed_hash!);assert.equal((await batchResult(f.db,batch)).files[1].items[0].status,'DUPLICATE');
  const secondBatch=f.batch(),file3=f.file(secondBatch);await attachPaper(f.db,secondBatch,file3,'p');const repeated=await f.register(secondBatch,file3,q,1);
  assert.equal(repeated.status,'DUPLICATE');assert.equal(repeated.canonical_id,first.canonical_id);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM canonical_questions').get()!.n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM source_documents').get()!.n,2);assert.equal(f.sql.prepare('SELECT count(*) n FROM question_occurrences').get()!.n,2);assert.equal(f.sql.prepare('SELECT count(*) n FROM question_module_links').get()!.n,2);
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(f.sql.prepare('SELECT status FROM paper_questions WHERE id=?').get(q)!.status,'pending','No AI business state is overwritten');
 }finally{f.close();}
});
test('concurrent human confirmations of equal identities create one canonical and correctly report NEW / DUPLICATE',async()=>{
 const f=fixture();try {
  const batch=f.batch(),q=f.question('p',1),q2=f.question('p2',1),file=f.file(batch),file2=f.file(batch,'p2',1);
  await attachPaper(f.db,batch,file,'p');await attachPaper(f.db,batch,file2,'p2');
  const first=await f.register(batch,file,q,1),second=await f.register(batch,file2,q2,1);
  await Promise.all([confirmItem(f.db,f.bucket,batch,first.id,f.plain,first.observed_hash!),confirmItem(f.db,f.bucket,batch,second.id,f.plain,second.observed_hash!)]);
  const result=await batchResult(f.db,batch);
  assert.equal(result.counts.NEW,1);assert.equal(result.counts.DUPLICATE,1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM canonical_questions').get()!.n,1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM canonical_question_revisions').get()!.n,1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM question_occurrences').get()!.n,2);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM question_module_links').get()!.n,2);
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});
test('equal text with different required images stays review; cross-page cannot be marked not applicable',async()=>{
 const f=fixture();try {
  const batch=f.batch(),q=f.question('p',1,'As shown, find x','graph-a'),file=f.file(batch);await attachPaper(f.db,batch,file,'p');const i=await f.register(batch,file,q,1);
  await confirmItem(f.db,f.bucket,batch,i.id,{...f.plain,visual:true},i.observed_hash!);
  const q2=f.question('p2',1,'As shown, find x','graph-b'),file2=f.file(batch,'p2',1);await attachPaper(f.db,batch,file2,'p2');const i2=await f.register(batch,file2,q2,1);
  await assert.rejects(()=>confirmItem(f.db,f.bucket,batch,i2.id,{...f.plain,visual:true},i2.observed_hash!),/完整身份不同/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM canonical_questions').get()!.n,1);
  const q3=f.question('p2',2,'continued','image',[{page:1,x:0,y:0,width:1,height:1},{page:2,x:0,y:0,width:1,height:1}]);const i3=await f.register(batch,file2,q3,2);
  await assert.rejects(()=>confirmItem(f.db,f.bucket,batch,i3.id,f.plain,i3.observed_hash!));
 }finally{f.close();}
});
test('stale review, changed PDF bytes, missing image and other scope sources are rejected',async()=>{
 const f=fixture();try {
  const batch=f.batch(),q=f.question('p',1),file=f.file(batch);await attachPaper(f.db,batch,file,'p');const i=await f.register(batch,file,q,1);
  await assert.rejects(()=>confirmItem(f.db,f.bucket,batch,i.id,f.plain,'0'.repeat(64)),/变化/);
  f.bytes.set('source:p',new TextEncoder().encode('tampered'));await assert.rejects(()=>confirmItem(f.db,f.bucket,batch,i.id,f.plain,i.observed_hash!),/bytes differ/);
  f.sql.exec("INSERT INTO question_library_scopes(id,code,name,scope_type,kind,ownership_status,owner_principal_id) VALUES('other','other','other','legacy_private','private','known','project_owner');UPDATE source_documents SET scope_id='other' WHERE math_paper_id='p'");
  await assert.rejects(()=>attachPaper(f.db,batch,file,'p'),/其他 scope/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM canonical_questions').get()!.n,0);
 }finally{f.close();}
});
test('a concurrent source edit makes transaction guard roll back the complete canonical graph',async()=>{
 const f=fixture();try {
  const batch=f.batch(),q=f.question('p',1),file=f.file(batch);await attachPaper(f.db,batch,file,'p');const i=await f.register(batch,file,q,1);
  f.setBeforeBatch(()=>f.sql.prepare('UPDATE paper_questions SET question_text=? WHERE id=?').run('Changed before commit',q));
  await assert.rejects(()=>confirmItem(f.db,f.bucket,batch,i.id,f.plain,i.observed_hash!),/CHECK/);
  for(const name of ['canonical_questions','canonical_question_revisions','question_occurrences','question_module_links'])assert.equal(f.sql.prepare('SELECT count(*) n FROM '+name).get()!.n,0);
  assert.equal(f.sql.prepare('SELECT status FROM paper_import_items WHERE id=?').get(i.id)!.status,'NEEDS_REVIEW');
 }finally{f.close();}
});
test('missing or replaced image bytes cannot AUTO_READY an existing human mapping',async()=>{
 const f=fixture();try {
  const batch=f.batch(),q=f.question('p',1),file=f.file(batch);await attachPaper(f.db,batch,file,'p');const i=await f.register(batch,file,q,1);
  await confirmItem(f.db,f.bucket,batch,i.id,f.plain,i.observed_hash!);
  const row=f.sql.prepare('SELECT image_key FROM paper_questions WHERE id=?').get(q)!;
  f.bytes.set(String(row.image_key),new TextEncoder().encode('tampered screenshot'));
  const repeat=f.batch(),file2=f.file(repeat);await attachPaper(f.db,repeat,file2,'p');const i2=await f.register(repeat,file2,q,1);
  assert.equal(i2.status,'NEEDS_REVIEW');assert.equal(i2.canonical_id,null);
  f.bytes.delete(String(row.image_key));const repeat2=f.batch(),file3=f.file(repeat2);await attachPaper(f.db,repeat2,file3,'p');const i3=await f.register(repeat2,file3,q,1);assert.equal(i3.status,'NEEDS_REVIEW');
 }finally{f.close();}
});

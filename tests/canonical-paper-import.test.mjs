import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { sha256, prepareReadyRecord, resolveProjectPrivateScope, businessSnapshot, identitySnapshot, planCanonicalPaperImport, importCanonicalPaperTransaction, verifyReadyMappings } from '../lib/canonical-paper-import.mjs';
import { APPLICABILITY, finalizeHumanDecision } from '../scripts/finalize-canonical-paper-import.mjs';
import { createPendingIdentityDecision } from '../lib/paper-identity-review-package.mjs';
import { validateCanonicalIdentityDecision, DECISION_VERSION } from '../lib/canonical-identity-decision.mjs';
import { CANONICAL_TABLES } from '../lib/paper-canonical-preview.mjs';

function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE papers(id TEXT PRIMARY KEY,title TEXT,original_filename TEXT,source_key TEXT,source_type TEXT,file_hash TEXT,created_at TEXT);
    CREATE TABLE paper_questions(id TEXT PRIMARY KEY,paper_id TEXT,question_number INTEGER,regions TEXT,image_key TEXT,question_text TEXT,classification TEXT,status TEXT,explanation TEXT,revision INTEGER,updated_at TEXT);
    CREATE TABLE questions(id INTEGER PRIMARY KEY);CREATE TABLE english_papers(id TEXT PRIMARY KEY);CREATE TABLE english_questions(id TEXT PRIMARY KEY);`);
  // Existing migration is used only to construct an isolated in-memory test fixture.
  db.exec(readFileSync(new URL('../drizzle/0015_canonical_identity_layer.sql',import.meta.url),'utf8'));
  return db;
}
function record(db,scope,{id='q1',paperId='p',number=1,text='x²=4',visual=false,imageHash=sha256('image')}={}) {
  const sourceHash=sha256('pdf:'+paperId);
  if(!db.prepare('SELECT id FROM papers WHERE id=?').get(paperId)) db.prepare('INSERT INTO papers VALUES(?,?,?,?,?,?,?)').run(paperId,'Synthetic','synthetic.pdf','source:'+paperId,'application/pdf',sourceHash,'2026-10-07T00:00:00Z');
  db.prepare('INSERT INTO paper_questions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,paperId,number,JSON.stringify([{page:1,x:0,y:0,width:1,height:1}]),'image:'+id,`${number}. ${text}`,'{"education_stage":"高中"}','ready','synthetic auxiliary explanation',0,'2026-10-07T00:00:00Z');
  const q=db.prepare('SELECT * FROM paper_questions WHERE id=?').get(id),paper=db.prepare('SELECT * FROM papers WHERE id=?').get(paperId);
  const decision={decision_version:DECISION_VERSION,decision_origin:'human',paper_question_id:id,paper_id:paperId,review_status:'READY',
    scope_decision:{status:'confirmed',scope_id:scope.id,scope_code:scope.code,scope_type:scope.scope_type,kind:scope.kind,ownership_status:scope.ownership_status,owner_principal_id:scope.owner_principal_id,decision_basis:'synthetic explicit human private review',authorization_evidence:''},
    applicability:{formula:true,options:false,subquestions:false,visual,cross_page:false},review_context:{multiple_regions:false,possible_cross_page:false},
    text_complete:true,formula_complete:true,options_complete:'not_applicable',subquestions_complete:'not_applicable',visual_complete:visual?true:'not_applicable',regions_complete:true,cross_page_complete:'not_applicable',source_confirmed:true,missing_reasons:[],review_notes:'synthetic',reviewed_at:'2026-10-07T12:00:00Z'};
  return prepareReadyRecord({question:q,paper,decision,imageHash,sourceHash});
}
test('dry-run does not write; first transaction creates valid graph and second creates zero rows without changing legacy/canonical snapshots',()=>{
  const db=fixture();try {
    const scope=resolveProjectPrivateScope(db),records=[record(db,scope),record(db,scope,{id:'550e8400-e29b-41d4-a716-446655440000',number:2,text:'x²=8'})];
    const legacy=businessSnapshot(db),empty=identitySnapshot(db),plan=planCanonicalPaperImport(db,records,scope);
    assert.deepEqual(identitySnapshot(db),empty);assert.deepEqual(plan.counts,{question_library_scopes:1,canonical_questions:2,canonical_question_revisions:2,source_documents:1,question_occurrences:2,question_module_links:2,existing_links:0});
    const first=importCanonicalPaperTransaction(db,records,scope,{expectedBusiness:legacy,expectedIdentity:empty});assert.deepEqual(first.counts,plan.counts);
    const state=identitySnapshot(db),second=importCanonicalPaperTransaction(db,records,scope,{expectedBusiness:legacy,expectedIdentity:state});
    for(const table of CANONICAL_TABLES) assert.equal(second.counts[table],0);
    assert.deepEqual(identitySnapshot(db),state);assert.deepEqual(businessSnapshot(db),legacy);assert.equal(verifyReadyMappings(db,records,scope).length,2);
    assert.equal(db.prepare('SELECT module_record_id FROM question_module_links WHERE legacy_paper_question_id=?').get(records[1].q.id).module_record_id,records[1].q.id);
  } finally{db.close();}
});
test('exact complete content in same scope reuses canonical/revision with two distinct occurrences and module links',()=>{
  const db=fixture();try {
    const scope=resolveProjectPrivateScope(db),records=[record(db,scope),record(db,scope,{id:'q2',number:2})];
    const result=importCanonicalPaperTransaction(db,records,scope);
    assert.equal(result.counts.canonical_questions,1);assert.equal(result.counts.canonical_question_revisions,1);assert.equal(result.counts.question_occurrences,2);assert.equal(result.counts.question_module_links,2);
    assert.equal(result.mappings[0].canonical_id,result.mappings[1].canonical_id);assert.notEqual(result.mappings[0].occurrence_id,result.mappings[1].occurrence_id);
  }finally{db.close();}
});
test('necessary visual byte differences keep equal text hashes separate',()=>{
  const db=fixture();try {
    const scope=resolveProjectPrivateScope(db),a=record(db,scope,{visual:true,imageHash:sha256('graph-a')}),b=record(db,scope,{id:'q2',number:2,visual:true,imageHash:sha256('graph-b')});
    assert.equal(a.textHash,b.textHash);assert.notEqual(a.identityHash,b.identityHash);
    assert.equal(importCanonicalPaperTransaction(db,[a,b],scope).counts.canonical_questions,2);
  }finally{db.close();}
});
test('scope isolation prevents cross-scope source reuse and permits equal identities only as distinct canonicals in distinct scopes',()=>{
  const db=fixture();try {
    const a=resolveProjectPrivateScope(db),r1=record(db,a);importCanonicalPaperTransaction(db,[r1],a);
    const b={...a,id:'second-scope',code:'second-private'},samePaper=record(db,b,{id:'q2',number:2});
    assert.throws(()=>importCanonicalPaperTransaction(db,[samePaper],b),/another scope/);
    const otherPaper=record(db,b,{id:'q3',paperId:'p2'}),result=importCanonicalPaperTransaction(db,[otherPaper],b);
    assert.equal(result.counts.canonical_questions,1);assert.equal(r1.identityHash,otherPaper.identityHash);
    assert.equal(db.prepare('SELECT count(*) n FROM canonical_questions').get().n,2);
  }finally{db.close();}
});
test('failure before commit rolls back all six new tables and preserves legacy data',()=>{
  const db=fixture();try {
    const scope=resolveProjectPrivateScope(db),r=record(db,scope),legacy=businessSnapshot(db),empty=identitySnapshot(db);
    assert.throws(()=>importCanonicalPaperTransaction(db,[r],scope,{beforeCommit:()=>{throw Error('injected failure');}}),/injected failure/);
    assert.deepEqual(identitySnapshot(db),empty);assert.deepEqual(businessSnapshot(db),legacy);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});
test('stale source or changed canonical baseline is rejected, not silently rebound',()=>{
  const db=fixture();try {
    const scope=resolveProjectPrivateScope(db),r=record(db,scope);importCanonicalPaperTransaction(db,[r],scope);
    db.prepare('UPDATE paper_questions SET revision=1 WHERE id=?').run(r.q.id);
    assert.throws(()=>importCanonicalPaperTransaction(db,[r],scope),/Source question changed/);
    assert.throws(()=>importCanonicalPaperTransaction(db,[],scope,{expectedIdentity:{}}),/Canonical data changed/);
  }finally{db.close();}
});
test('matching hash with different identity payload fails safely',()=>{
  const db=fixture();try {
    const scope=resolveProjectPrivateScope(db),a=record(db,scope);importCanonicalPaperTransaction(db,[a],scope);
    const b=record(db,scope,{id:'q2',number:2,text:'x²=8'});b.identityHash=a.identityHash;
    assert.throws(()=>importCanonicalPaperTransaction(db,[b],scope),/Hash collision/);
    assert.equal(db.prepare('SELECT count(*) n FROM question_module_links').get().n,1);
  }finally{db.close();}
});
test('authorized ten finalized decisions pass unchanged validator; applicability/NA and project-owned private scope are explicit',()=>{
  const scope={id:'project-scope',code:'project-private',scope_type:'legacy_private',kind:'private',ownership_status:'known',owner_principal_id:'project_owner'};
  for(const [id,app] of Object.entries(APPLICABILITY)) {
    const draft=createPendingIdentityDecision({paper_question_id:id,paper_id:'paper',multiple_regions:app.cross_page,possible_cross_page:app.cross_page});
    const ready=finalizeHumanDecision(draft,scope,'2026-10-07T12:00:00Z');assert.equal(validateCanonicalIdentityDecision(ready).valid,true);assert.equal(ready.review_status,'READY');
    assert.equal(ready.options_complete,app.options?true:'not_applicable');assert.equal(ready.visual_complete,app.visual?true:'not_applicable');
  }
  assert.equal(Object.keys(APPLICABILITY).length,10);assert.equal(Object.values(APPLICABILITY).filter(a=>a.visual).length,2);assert.equal(Object.values(APPLICABILITY).filter(a=>a.cross_page).length,5);
});

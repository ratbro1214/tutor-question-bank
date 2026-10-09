import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeQuestionTextV1, hashNormalizedText, NORMALIZATION_VERSION, CANONICAL_TABLES } from './paper-canonical-preview.mjs';
import { validateCanonicalIdentityDecision } from './canonical-identity-decision.mjs';

export const CONTENT_SCHEMA_VERSION = 'math-paper-ready-v1';
export const IDENTITY_VERSION = 'math-paper-identity-v1';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function stableJSON(value) {
  if (Array.isArray(value)) return '['+value.map(stableJSON).join(',')+']';
  if (value !== null && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJSON(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export const observedSourceHash = q => sha256(stableJSON([q.id,q.paper_id,q.question_number,q.question_text,q.image_key,q.regions,q.classification,q.status,q.revision,q.updated_at]));

export function prepareReadyRecord({question:q,paper,decision,imageHash,sourceHash,allowPendingBusiness=false}) {
  const validation=validateCanonicalIdentityDecision(decision);
  assert.equal(validation.valid,true,JSON.stringify(validation.errors));
  assert.equal(decision.review_status,'READY');assert.equal(decision.decision_origin,'human');
  assert.equal(decision.paper_question_id,q.id);assert.equal(decision.paper_id,q.paper_id);assert.equal(paper.id,q.paper_id);
  // Business pending means no AI solution yet, not an incomplete human-reviewed identity.
  assert.ok(q.status==='ready'||(allowPendingBusiness&&q.status==='pending'));
  assert.equal(paper.file_hash,sourceHash,'Source document bytes differ from stored file_hash');
  assert.match(imageHash,/^[a-f0-9]{64}$/);
  const regions=JSON.parse(q.regions);
  assert.ok(regions.length>0 && regions.every(r=>Number.isInteger(r.page)&&r.page>0&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.001&&r.y+r.height<=1.001));
  assert.equal(decision.review_context.multiple_regions,regions.length>1);
  assert.equal(decision.review_context.possible_cross_page,new Set(regions.map(r=>r.page)).size>1);
  const normalizedText=normalizeQuestionTextV1(q.question_text,q.question_number),textHash=hashNormalizedText(normalizedText);
  assert.ok(normalizedText);
  const identity={subject:'math',normalized_text:normalizedText,text_normalization_version:NORMALIZATION_VERSION,identity_version:IDENTITY_VERSION,
    required_visuals:decision.applicability.visual?[{sha256:imageHash}]:[]};
  const payload={identity,normalized_text_hash:textHash,text_normalization_version:NORMALIZATION_VERSION,
    human_review:decision,visual_refs:decision.applicability.visual?{image_key:q.image_key,image_sha256:imageHash}:null};
  return {q,paper,decision,regions,normalizedText,textHash,identityHash:sha256(stableJSON(identity)),identity,payload,imageHash,observedHash:observedSourceHash(q)};
}

export function resolveProjectPrivateScope(db) {
  let scope=db.prepare("SELECT * FROM question_library_scopes WHERE code='project-private'").get();
  if (!scope) scope=db.prepare("SELECT * FROM question_library_scopes WHERE kind='private' AND ownership_status='known' AND owner_principal_id='project_owner' ORDER BY id LIMIT 1").get();
  if (scope) {
    assert.equal(scope.kind,'private');assert.notEqual(scope.scope_type,'authorized_public');
    assert.equal(scope.ownership_status,'known');assert.equal(scope.owner_principal_id,'project_owner');
    return scope;
  }
  return {id:randomUUID(),code:'project-private',name:'本人项目私有题库',scope_type:'legacy_private',kind:'private',owner_principal_id:'project_owner',ownership_status:'known'};
}

export function businessSnapshot(db) {
  const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all().filter(t=>!CANONICAL_TABLES.includes(t.name));
  return Object.fromEntries(tables.map(table=>{
    const quoted='"'+table.name.replaceAll('"','""')+'"';
    const rows=db.prepare('SELECT * FROM '+quoted).all().map(stableJSON).sort();
    return [table.name,{schema:table.sql,count:rows.length,rows_sha256:sha256(stableJSON(rows))}];
  }));
}
export function identitySnapshot(db) {
  return Object.fromEntries(CANONICAL_TABLES.map(name=>[name,db.prepare('SELECT * FROM '+name).all().map(stableJSON).sort()]));
}

export function planCanonicalPaperImport(db,records,scope) {
  assert.equal(scope.kind,'private');assert.notEqual(scope.scope_type,'authorized_public');assert.equal(scope.owner_principal_id,'project_owner');assert.equal(scope.ownership_status,'known');
  const scoped=db.prepare('SELECT * FROM question_library_scopes WHERE id=? OR code=?').all(scope.id,scope.code);
  if(scoped.length) {assert.equal(scoped.length,1);for(const field of ['id','code','scope_type','kind','owner_principal_id','ownership_status']) assert.equal(scoped[0][field],scope[field]);}
  const plan={new_scopes:scoped.length?[]:[scope],new_sources:[],new_canonicals:[],new_revisions:[],new_occurrences:[],new_links:[],existing_links:[],mappings:[]};
  const sources=new Map(),identities=new Map();
  for(const r of records) {
    assert.equal(r.decision.scope_decision.scope_id,scope.id,'Decision scope and target scope differ');
    assert.deepEqual(db.prepare('SELECT * FROM paper_questions WHERE id=?').get(r.q.id),r.q,'Source question changed since read');
    assert.deepEqual(db.prepare('SELECT * FROM papers WHERE id=?').get(r.paper.id),r.paper,'Paper changed since read');
    const oldLink=db.prepare("SELECT * FROM question_module_links WHERE module_type='paper_question' AND module_record_id=?").get(r.q.id);
    if(oldLink) {
      assert.equal(oldLink.observed_source_hash,r.observedHash,'Already-linked source changed; refusing silent remap');
      const graph=lookupMapping(db,r.q.id);
      checkMapping(graph,r,scope);
      plan.existing_links.push(oldLink.id);plan.mappings.push(graph);continue;
    }
    let source=sources.get(r.paper.id);
    if(!source) {
      source=db.prepare('SELECT * FROM source_documents WHERE math_paper_id=?').get(r.paper.id);
      if(source) {
        assert.equal(source.scope_id,scope.id,'Source document belongs to another scope');assert.equal(source.source_type,'math_paper');
        assert.equal(source.file_hash,r.paper.file_hash);assert.equal(source.storage_key,r.paper.source_key);
      } else {
        source={id:randomUUID(),scope_id:scope.id,source_type:'math_paper',title:r.paper.title,math_paper_id:r.paper.id,
          legacy_source_key:r.paper.id,file_storage:'r2',storage_key:r.paper.source_key,original_filename:r.paper.original_filename,
          mime_type:r.paper.source_type,file_hash:r.paper.file_hash,metadata:stableJSON({import_stage:'2E-Final',original_created_at:r.paper.created_at})};
        plan.new_sources.push(source);
      }
      sources.set(r.paper.id,source);
    }
    const identityKey=scope.id+':'+r.identityHash;
    let target=identities.get(identityKey);
    if(target) assert.equal(stableJSON(target.identity),stableJSON(r.identity),'In-memory identity hash collision');
    if(!target) {
      const matches=db.prepare(`SELECT c.id AS canonical_id,r.* FROM canonical_questions c JOIN canonical_question_revisions r ON r.id=c.current_revision_id AND r.canonical_question_id=c.id WHERE c.scope_id=? AND c.status='active' AND r.identity_status='ready' AND r.normalized_hash=? AND r.normalization_version=? AND r.content_schema_version=?`).all(scope.id,r.identityHash,IDENTITY_VERSION,CONTENT_SCHEMA_VERSION);
      assert.ok(matches.length<=1,'Multiple active exact identities in one scope require explicit repair');
      if(matches.length) {
        const match=matches[0];assert.equal(stableJSON(JSON.parse(match.payload).identity),stableJSON(r.identity),'Hash collision; content differs');
        target={canonical_id:match.canonical_id,revision_id:match.id,identity:r.identity};
      } else {
        target={canonical_id:randomUUID(),revision_id:randomUUID(),identity:r.identity};
        plan.new_canonicals.push({id:target.canonical_id,scope_id:scope.id,subject:'math',status:'provisional'});
        let classification=null;try{classification=JSON.parse(r.q.classification);}catch{}
        plan.new_revisions.push({id:target.revision_id,canonical_question_id:target.canonical_id,revision:1,subject:'math',education_stage:classification?.education_stage||null,
          original_text:r.q.question_text,normalized_text:r.normalizedText,normalized_hash:r.identityHash,content_schema_version:CONTENT_SCHEMA_VERSION,normalization_version:IDENTITY_VERSION,
          payload:stableJSON(r.payload),identity_status:'ready',change_reason:'2E-Final project owner human confirmation',created_by:'project_owner'});
      }
      identities.set(identityKey,target);
    }
    const key='paper_question:'+r.q.id;
    assert.equal(db.prepare('SELECT count(*) n FROM question_occurrences WHERE source_document_id=? AND occurrence_key=?').get(source.id,key).n,0,'Occurrence exists without expected module link; refusing to duplicate');
    const occurrence={id:randomUUID(),canonical_question_id:target.canonical_id,content_revision_id:target.revision_id,source_document_id:source.id,source_type:'math_paper',occurrence_key:key,
      question_number:String(r.q.question_number),page:Math.min(...r.regions.map(region=>region.page)),source_locator_json:stableJSON({paper_id:r.q.paper_id,paper_question_id:r.q.id,question_number:r.q.question_number,regions:r.regions}),
      image_key:r.q.image_key,original_filename:r.paper.original_filename,raw_text:r.q.question_text,occurrence_hash:r.imageHash,metadata:stableJSON({import_stage:'2E-Final',human_review:r.decision}),mapping_status:'confirmed'};
    const link={id:randomUUID(),module_type:'paper_question',module_record_id:String(r.q.id),canonical_question_id:target.canonical_id,occurrence_id:occurrence.id,
      legacy_paper_question_id:r.q.id,observed_source_hash:r.observedHash,mapping_revision:1};
    plan.new_occurrences.push(occurrence);plan.new_links.push(link);
    plan.mappings.push({paper_question_id:r.q.id,canonical_id:target.canonical_id,revision_id:target.revision_id,occurrence_id:occurrence.id,source_document_id:source.id,text_hash:r.textHash,identity_hash:r.identityHash});
  }
  plan.counts={question_library_scopes:plan.new_scopes.length,canonical_questions:plan.new_canonicals.length,canonical_question_revisions:plan.new_revisions.length,source_documents:plan.new_sources.length,question_occurrences:plan.new_occurrences.length,question_module_links:plan.new_links.length,existing_links:plan.existing_links.length};
  return plan;
}

export function lookupMapping(db,id) {
  const rows=db.prepare(`SELECT pq.id AS paper_question_id,l.module_record_id,l.legacy_paper_question_id,l.observed_source_hash,
    c.id AS canonical_id,c.scope_id,c.status AS canonical_status,c.current_revision_id,r.id AS revision_id,r.normalized_text,r.normalized_hash,r.normalization_version,r.content_schema_version,r.payload,r.identity_status,
    o.id AS occurrence_id,o.canonical_question_id AS occurrence_canonical,o.content_revision_id,o.source_document_id,o.source_type,o.occurrence_key,o.source_locator_json,o.image_key,o.raw_text,o.occurrence_hash,o.mapping_status,
    s.math_paper_id,s.scope_id AS source_scope_id,s.storage_key,s.file_hash
    FROM paper_questions pq JOIN question_module_links l ON l.module_type='paper_question' AND l.module_record_id=pq.id
    JOIN canonical_questions c ON c.id=l.canonical_question_id
    JOIN canonical_question_revisions r ON r.id=c.current_revision_id AND r.canonical_question_id=c.id
    JOIN question_occurrences o ON o.id=l.occurrence_id AND o.canonical_question_id=c.id
    JOIN source_documents s ON s.id=o.source_document_id WHERE pq.id=?`).all(id);
  assert.equal(rows.length,1,'Expected exactly one complete canonical graph for '+id);
  return rows[0];
}
function checkMapping(g,r,scope) {
  assert.equal(g.module_record_id,r.q.id);assert.equal(g.legacy_paper_question_id,r.q.id);assert.equal(g.observed_source_hash,r.observedHash);
  assert.equal(g.scope_id,scope.id);assert.equal(g.source_scope_id,scope.id);assert.equal(g.canonical_status,'active');assert.equal(g.identity_status,'ready');
  assert.equal(g.normalized_text,r.normalizedText);assert.equal(g.normalized_hash,r.identityHash);
  assert.equal(g.normalization_version,IDENTITY_VERSION);assert.equal(g.content_schema_version,CONTENT_SCHEMA_VERSION);
  const payload=JSON.parse(g.payload);assert.equal(payload.normalized_text_hash,r.textHash);assert.equal(stableJSON(payload.identity),stableJSON(r.identity));
  assert.equal(g.content_revision_id,g.revision_id);assert.equal(g.current_revision_id,g.revision_id);assert.equal(g.occurrence_canonical,g.canonical_id);
  assert.equal(g.math_paper_id,r.paper.id);assert.equal(g.storage_key,r.paper.source_key);assert.equal(g.file_hash,r.paper.file_hash);
  assert.equal(g.image_key,r.q.image_key);assert.equal(g.raw_text,r.q.question_text);assert.equal(g.occurrence_hash,r.imageHash);assert.equal(g.mapping_status,'confirmed');
  assert.equal(g.source_type,'math_paper');assert.equal(g.occurrence_key,'paper_question:'+r.q.id);
  const locator=JSON.parse(g.source_locator_json);assert.deepEqual(locator.regions,r.regions);assert.equal(locator.paper_question_id,r.q.id);assert.equal(locator.paper_id,r.paper.id);
}
export function verifyReadyMappings(db,records,scope) {
  return records.map(r=>{const g=lookupMapping(db,r.q.id);checkMapping(g,r,scope);return {paper_question_id:r.q.id,paper_id:r.paper.id,canonical_id:g.canonical_id,revision_id:g.revision_id,occurrence_id:g.occurrence_id,source_document_id:g.source_document_id,scope_id:g.scope_id,normalized_text_hash:r.textHash,full_identity_hash:r.identityHash};});
}

// Only these six tables can be inserted; only freshly-created canonical pointers can be updated.
const allowed=new Set(CANONICAL_TABLES);
function insert(db,table,row) {
  assert.ok(allowed.has(table));const columns=Object.keys(row);
  assert.ok(columns.every(k=>/^[a-z_]+$/.test(k)));
  db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(k=>row[k]));
}
export function importCanonicalPaperTransaction(db,records,scope,{expectedBusiness,expectedIdentity,beforeCommit}={}) {
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1,'Foreign keys must be enabled');
  db.exec('BEGIN IMMEDIATE');
  try {
    const original=businessSnapshot(db);if(expectedBusiness) assert.deepEqual(original,expectedBusiness,'Business data changed since dry-run');
    if(expectedIdentity) assert.deepEqual(identitySnapshot(db),expectedIdentity,'Canonical data changed since dry-run');
    const plan=planCanonicalPaperImport(db,records,scope);
    for(const row of plan.new_scopes) insert(db,'question_library_scopes',row);
    for(const row of plan.new_sources) insert(db,'source_documents',row);
    for(const row of plan.new_canonicals) insert(db,'canonical_questions',row);
    for(const row of plan.new_revisions) insert(db,'canonical_question_revisions',row);
    for(const row of plan.new_revisions) {
      assert.equal(db.prepare("UPDATE canonical_questions SET current_revision_id=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=? AND current_revision_id IS NULL AND status='provisional'").run(row.id,row.canonical_question_id).changes,1);
    }
    for(const row of plan.new_occurrences) insert(db,'question_occurrences',row);
    for(const row of plan.new_links) insert(db,'question_module_links',row);
    const mappings=verifyReadyMappings(db,records,scope);
    assert.deepEqual(businessSnapshot(db),original,'Legacy business table/schema changed; rollback');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    beforeCommit?.(plan);
    db.exec('COMMIT');return {counts:plan.counts,mappings};
  } catch(error) {db.exec('ROLLBACK');throw error;}
}

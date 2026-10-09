import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { normalizeQuestionTextV1 as normalize, hashNormalizedText as hash, buildPaperCanonicalPreview as build, CANONICAL_TABLES } from '../lib/paper-canonical-preview.mjs';
import { runPaperCanonicalPreview } from '../scripts/preview-paper-canonical-mapping.mjs';
import { runPaperCanonicalReview } from '../scripts/report-paper-canonical-review.mjs';

const paper = { id: 'p', title: 'Synthetic only', source_key: 'source-p', original_filename: 'synthetic.pdf', file_hash: 'a'.repeat(64), source_type: 'application/pdf', created_at: '2026-10-07' };
const question = (id='8', overrides={}) => ({ id, paper_id: 'p', question_number: 17, question_text: '17. 求 x²=4 的根。', image_key: 'image-'+id,
  regions: JSON.stringify([{ page:1,x:0,y:0,width:1,height:0.5 }]), classification: JSON.stringify({ subject:'高中数学',education_stage:'高中',needs_review:false }),
  status:'ready',explanation:'synthetic-presence-only',revision:0,error:'',updated_at:'2026-10-07', ...overrides });

test('17. and 17． prefixes normalize identically; decimal and subpart are preserved', () => {
  assert.equal(normalize('17.已知椭圆'),normalize('17．已知椭圆'));
  assert.equal(normalize('１７．已知椭圆',17),'已知椭圆');
  assert.equal(normalize('第17题：已知椭圆',17),'已知椭圆');
  assert.equal(normalize('17.已知',18),'17.已知');
  assert.equal(normalize('3.14 是近似值'),'3.14 是近似值');
  assert.equal(normalize('(1) 求 x'),'(1) 求 x');
});
test('redundant spaces including fullwidth/NBSP have the same hash', () => {
  assert.equal(hash(normalize('17. 已知\u3000 x²  =\u00a0 4y')),hash(normalize('17．已知 x² = 4y')));
});
test('CRLF/LF and layout newlines normalize identically', () => {
  assert.equal(hash(normalize('17. 已知\r\n x² = 4y\n\n求 x')),hash(normalize('17． 已知 x² = 4y 求 x')));
});
test('different numbers remain different content and hashes', () => {
  assert.notEqual(normalize('x² = 4y'),normalize('x² = 8y'));
  assert.notEqual(hash(normalize('x² = 4y')),hash(normalize('x² = 8y')));
});
test('different options are not discarded or equated', () => {
  assert.notEqual(normalize('17. 求 x A.1 B.2 C.3 D.4'),normalize('17. 求 x A.1 B.2 C.3 D.8'));
  assert.ok(normalize('17. 求 x A.1 B.2').includes('A.1 B.2'));
});
test('math symbols, exponents, variables, literal escapes, score and conditions survive', () => {
  const text='(本题满分17分) x² ≥ 4y，x₁ ≠ x₂，α∩β ⊥ l，√3 ± ∞；a/b − c，x∈R，f′(x)；\\n';
  assert.equal(normalize('17. '+text,17),text);
  assert.notEqual(normalize('x²=4'),normalize('x2=4'));
});
test('empty/number-only stems are INCOMPLETE and never enter empty-hash duplicate groups', () => {
  const result=build([paper],[question('1',{question_text:''}),question('2',{question_text:'17． '})]);
  assert.equal(result.summary.INCOMPLETE,2); assert.equal(result.summary.duplicate_group_count,0);
  assert.equal(result.canonical_preview[0].content_candidate.normalized_hash,null);
});
test('visual clues and unknown crop completeness conservatively require review', () => {
  const result=build([paper],[question('1',{question_text:'17. 如图，函数图象上点 A...'}),question('2')]);
  for(const c of result.canonical_preview) { assert.equal(c.identity_status,'NEEDS_REVIEW'); assert.equal(c.requires_visual_review,true); assert.equal(c.safe_to_merge,false); }
  assert.ok(result.canonical_preview[0].visual_review_reasons.some(r=>r.includes('依赖提示')));
});
test('same text hash yields within/cross-paper duplicate candidates without merging IDs', () => {
  const p2={...paper,id:'p2',source_key:'source-p2'};
  const result=build([paper,p2],[question('a'),question('b'),question('c',{paper_id:'p2'})]);
  assert.equal(result.summary.DUPLICATE_CANDIDATE,3); assert.equal(result.duplicate_groups.length,1);
  const group=result.duplicate_groups[0]; assert.equal(group.within_paper_duplicate,true); assert.equal(group.cross_paper_duplicate,true);
  assert.equal(group.safe_to_merge,false); assert.equal(group.normalized_texts_equal,true);
  assert.equal(new Set(result.canonical_preview.map(c=>c.canonical_candidate.id)).size,3);
  assert.equal(new Set(group.future_shared_identity_example.occurrences.map(o=>o.source_document_id)).size,2);
});
test('integer-style, UUID and text IDs are preserved verbatim as module_record_id TEXT', () => {
  const ids=['8','550e8400-e29b-41d4-a716-446655440000','paper-Q17'];
  const result=build([paper],ids.map(id=>question(id,{question_text:'17. '+id})));
  assert.deepEqual(result.canonical_preview.map(c=>c.module_link_candidate.module_record_id),ids);
  for(const c of result.canonical_preview) {
    assert.equal(c.module_link_candidate.canonical_question_id,c.occurrence_candidate.canonical_question_id);
    assert.equal(c.module_link_candidate.occurrence_id,c.occurrence_candidate.id);
  }
});
test('invalid classification/regions, missing R2 references and pending/failed are visible', () => {
  const result=build([paper],[question('a',{classification:'{',regions:'bad',status:'failed',error:'synthetic'}),question('b',{status:'pending'})],{objectKeys:['source-p','image-b']});
  assert.equal(result.canonical_preview[0].identity_status,'INCOMPLETE');
  assert.equal(result.data_quality.invalid_classification,1); assert.equal(result.data_quality.invalid_or_missing_regions,1);
  assert.deepEqual(result.data_quality.business_status_counts,{failed:1,pending:1});
  assert.equal(result.canonical_preview[1].identity_status,'DUPLICATE_CANDIDATE');
  assert.equal(result.canonical_preview[1].base_identity_status,'NEEDS_REVIEW');
});

async function fixture() {
  const root=path.resolve(import.meta.dirname,'../../work/canonical-preview-test-'+randomUUID());
  const directory=path.join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const r2dir=path.join(root,'.wrangler/state/v3/r2/miniflare-R2BucketObject');
  await fs.mkdir(directory,{recursive:true}); await fs.mkdir(r2dir,{recursive:true});
  const database=path.join(directory,'synthetic.sqlite');
  const db=new DatabaseSync(database);
  try {
    db.exec(`CREATE TABLE papers(id TEXT PRIMARY KEY,title TEXT,original_filename TEXT,source_key TEXT,source_type TEXT,file_hash TEXT,created_at TEXT);
      CREATE TABLE paper_questions(id TEXT PRIMARY KEY,paper_id TEXT,question_number INTEGER,question_text TEXT,image_key TEXT,regions TEXT,classification TEXT,status TEXT,explanation TEXT,revision INTEGER,error TEXT,updated_at TEXT);
      CREATE TABLE questions(id INTEGER PRIMARY KEY); CREATE TABLE english_papers(id TEXT PRIMARY KEY); CREATE TABLE english_questions(id TEXT PRIMARY KEY);`);
    db.exec(await fs.readFile(new URL('../drizzle/0015_canonical_identity_layer.sql',import.meta.url),'utf8'));
    db.prepare('INSERT INTO papers VALUES (?,?,?,?,?,?,?)').run(...['id','title','original_filename','source_key','source_type','file_hash','created_at'].map(k=>paper[k]));
    const q=question('550e8400-e29b-41d4-a716-446655440000');
    const fields=['id','paper_id','question_number','question_text','image_key','regions','classification','status','explanation','revision','error','updated_at'];
    db.prepare('INSERT INTO paper_questions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(...fields.map(k=>q[k]));
    const r2=new DatabaseSync(path.join(r2dir,'objects.sqlite'));
    try { r2.exec('CREATE TABLE _mf_objects(key TEXT PRIMARY KEY,blob_id TEXT,size INTEGER)');
      r2.prepare('INSERT INTO _mf_objects VALUES(?,?,?)').run('source-p','source-blob',3);
      r2.prepare('INSERT INTO _mf_objects VALUES(?,?,?)').run(q.image_key,'image-blob',3);
    } finally {r2.close();}
    const blobs=path.join(root,'.wrangler/state/v3/r2/site-creator-r2/blobs'); await fs.mkdir(blobs,{recursive:true});
    await fs.writeFile(path.join(blobs,'source-blob'),'pdf'); await fs.writeFile(path.join(blobs,'image-blob'),'img');
  } finally {db.close();}
  return {root,database,outputDirectory:path.join(root,'reports')};
}
const fileHash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
test('real CLI logic reads synthetic DB/R2 with zero writes; canonical tables stay empty', async () => {
  const options=await fixture();
  const before=await fileHash(options.database);
  const r2=path.join(options.root,'.wrangler/state/v3/r2/miniflare-R2BucketObject/objects.sqlite');
  const image=path.join(options.root,'.wrangler/state/v3/r2/site-creator-r2/blobs/image-blob');
  const r2Before=await fileHash(r2), imageBefore=await fileHash(image);
  const {report,jsonFile,markdownFile}=await runPaperCanonicalPreview(options);
  assert.equal(await fileHash(options.database),before); assert.equal(await fileHash(r2),r2Before); assert.equal(await fileHash(image),imageBefore);
  assert.equal(report.zero_write_verification.passed,true); assert.equal(report.zero_write_verification.before.r2_object_count,2);
  for(const name of CANONICAL_TABLES) assert.equal(report.zero_write_verification.canonical_table_counts[name],0);
  assert.equal(JSON.parse(await fs.readFile(jsonFile,'utf8')).preview_only,true);
  assert.match(await fs.readFile(markdownFile,'utf8'),/module link candidate/);
  const review = await runPaperCanonicalReview(options);
  assert.equal(review.report.zero_write_verification.passed,true);
  assert.equal(await fileHash(options.database),before);
  assert.equal(await fileHash(r2),r2Before); assert.equal(await fileHash(image),imageBefore);
  assert.equal(review.report.items[0].image_file_reference.local_objects[0].size_matches,true);
  assert.equal(review.report.items[0].image_file_reference.local_objects[0].blob_exists,true);
  assert.equal(review.report.items[0].has_explanation,true);
  assert.match(await fs.readFile(review.markdownFile,'utf8'),/人工核对/);
  for(const name of CANONICAL_TABLES) assert.equal(review.report.zero_write_verification.canonical_table_counts[name],0);
  await assert.rejects(runPaperCanonicalReview(options),/Reports already exist/);
  await assert.rejects(runPaperCanonicalPreview(options),/Reports already exist/);
  await assert.rejects(runPaperCanonicalPreview({...options,outputDirectory:path.join(options.root,'.wrangler/state/reports')}),/protected business assets/);
});
test('preview runtime has no exec/run database mutations, no AI/network calls', async () => {
  for(const file of ['../scripts/preview-paper-canonical-mapping.mjs','../lib/paper-canonical-preview.mjs','../scripts/report-paper-canonical-review.mjs','../lib/paper-canonical-review.mjs']) {
    const text=await fs.readFile(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(text,/\.exec\s*\(|\.run\s*\(|\bfetch\s*\(/);
  }
});

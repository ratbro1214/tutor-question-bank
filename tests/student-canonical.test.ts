import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { StudentCanonicalStore } from '../lib/student-canonical-store';

function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  let race: (() => void) | null = null, fail = false, missing = false;
  const binding = { prepare(sql: string) { let values: (string | number)[] = []; const stmt = { bind(...v: (string | number)[]) { values = v; return stmt; }, async first() { return db.prepare(sql).get(...values) || null; }, async all() { return { results: db.prepare(sql).all(...values) }; }, run() { return db.prepare(sql).run(...values); } }; return stmt; }, async batch(statements: { run(): unknown }[]) { if (race) { const fn = race; race = null; fn(); } db.exec('BEGIN'); try { for (let i = 0; i < statements.length; i++) { statements[i].run(); if (fail && i === 2) throw Error('injected'); } db.exec('COMMIT'); return []; } catch (e) { db.exec('ROLLBACK'); throw e; } } } as unknown as D1Database;
  const bucket = { async get() { return missing ? null : { async arrayBuffer() { return new TextEncoder().encode('TEST ONLY IMAGE').buffer; } }; } } as unknown as R2Bucket;
  const classification = { schema_version: '1.0', taxonomy_version: 'cn-senior-math-1.0', subject: '高中数学', education_stage: '高中', chapter: { code: 'HS-DERIVATIVE', name: '导数及其应用' }, knowledge_points: [{ code: 'HS-DERIVATIVE-CALC', name: '基本初等函数的导数与运算' }], methods: [], question_type: '直接计算', difficulty: '基础', confidence: 1, needs_review: false, review_reasons: [], classification_notes: 'TEST ONLY', extracted_question: 'TEST ONLY f(x)=x²，求导数。' };
  db.exec(`INSERT INTO question_library_scopes(id,code,name,scope_type,kind,owner_principal_id,ownership_status) VALUES('s','project-private','TEST ONLY','legacy_private','private','project_owner','known'); INSERT INTO students(id,name) VALUES(1,'TEST ONLY'),(2,'OTHER');`);
  for (const id of [1, 2]) db.prepare(`INSERT INTO questions(id,student_id,image_key,original_filename,image_mime_type,extracted_question,chapter_code,chapter_name,question_type,difficulty,ai_classification,teacher_confirmed_classification) VALUES(?,1,'test.jpg','test.jpg','image/jpeg',?,'HS-DERIVATIVE','导数及其应用','直接计算','基础','{}',?)`).run(id, classification.extracted_question, JSON.stringify(classification));
  return { db, store: new StudentCanonicalStore(binding, bucket, 's', 'owner'), race(fn: () => void) { race = fn; }, fail() { fail = true; }, missing() { missing = true; } };
}
test('student question import preserves old rows, persists classification and is idempotent', async () => {
  const f = fixture(); try {
    const before = f.db.prepare('SELECT * FROM questions').all(); const p = await f.store.preview(1, 1);
    const result = await f.store.add(1, 1, p.snapshot, p.text); assert.match(result.canonicalId, /^[a-f0-9-]{36}$/);
    assert.equal((await f.store.add(1, 1, p.snapshot, p.text)).canonicalId, result.canonicalId);
    assert.equal((await f.store.preview(1, 1)).canonicalId, result.canonicalId);
    assert.deepEqual(f.db.prepare('SELECT * FROM questions').all(), before);
    const rev = f.db.prepare('SELECT * FROM canonical_question_revisions').get()!; assert.equal(rev.education_stage, '高中'); assert.equal(JSON.parse(String(rev.payload)).classification.knowledge_points[0].code, 'HS-DERIVATIVE-CALC');
    assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_questions').get()!.n, 1); assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { f.db.close(); }
});
test('same reviewed text and image reuse identity with separate student source mappings', async () => {
  const f = fixture(); try { const p = await f.store.preview(1, 1), p2 = await f.store.preview(2, 1); const a = await f.store.add(1, 1, p.snapshot, p.text), b = await f.store.add(2, 1, p2.snapshot, p2.text); assert.equal(a.canonicalId, b.canonicalId); assert.equal(b.reused, true); assert.equal(f.db.prepare('SELECT count(*) n FROM question_module_links').get()!.n, 2); } finally { f.db.close(); }
});
test('wrong student, missing image and stale snapshot cannot import', async () => {
  const f = fixture(); try { await assert.rejects(f.store.preview(1, 2), /不存在/); const p = await f.store.preview(1, 1); await assert.rejects(f.store.add(1, 1, 'stale', p.text), /已修改/); f.missing(); await assert.rejects(f.store.add(1, 1, p.snapshot, p.text), /题图缺失/); assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_questions').get()!.n, 0); } finally { f.db.close(); }
});
test('a mutation between preview validation and commit rolls back every identity write', async () => {
  const f = fixture(); try { const p = await f.store.preview(1, 1); f.race(() => f.db.prepare("UPDATE questions SET extracted_question='CHANGED' WHERE id=1").run()); await assert.rejects(f.store.add(1, 1, p.snapshot, p.text), /未完成/); assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_questions').get()!.n, 0); } finally { f.db.close(); }
});
test('database failure rolls back source, revision and mapping together', async () => {
  const f = fixture(); try { const p = await f.store.preview(1, 1); f.fail(); await assert.rejects(f.store.add(1, 1, p.snapshot, p.text), /未完成/); for (const table of ['canonical_questions', 'canonical_question_revisions', 'source_documents', 'question_occurrences', 'question_module_links']) assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n, 0); } finally { f.db.close(); }
});
test('edited student question cannot overwrite its earlier unified library version', async () => {
  const f = fixture(); try { const p = await f.store.preview(1, 1); await f.store.add(1, 1, p.snapshot, p.text); f.db.prepare("UPDATE questions SET extracted_question='CHANGED' WHERE id=1").run(); const changed = await f.store.preview(1, 1); await assert.rejects(f.store.add(1, 1, changed.snapshot, changed.text), /版本不同/); assert.equal(f.db.prepare('SELECT original_text FROM canonical_question_revisions').get()!.original_text, p.text); } finally { f.db.close(); }
});
test('paper archive with an empty legacy text uses saved teacher text for review', async () => {
  const f = fixture(); try { f.db.prepare("UPDATE questions SET extracted_question='' WHERE id=1").run(); const p = await f.store.preview(1, 1); assert.match(p.text, /求导数/); await f.store.add(1, 1, p.snapshot, p.text); assert.equal(f.db.prepare('SELECT original_text FROM canonical_question_revisions').get()!.original_text, p.text); assert.equal(f.db.prepare('SELECT extracted_question FROM questions WHERE id=1').get()!.extracted_question, ''); } finally { f.db.close(); }
});
test('invalid classification and mappings from another scope cannot be imported', async () => {
  const f = fixture(); try {
    const p = await f.store.preview(1, 1); await f.store.add(1, 1, p.snapshot, p.text);
    // Use the real fixture binding with a different scope to exercise mapping authorization.
    const binding = { prepare(sql: string) { let values: (string | number)[] = []; const stmt = { bind(...v: (string | number)[]) { values = v; return stmt; }, async first() { return f.db.prepare(sql).get(...values) || null; } }; return stmt; } } as unknown as D1Database;
    await assert.rejects(new StudentCanonicalStore(binding, {} as R2Bucket, 'other', 'stranger').preview(1, 1), /其他私有题库/);
    const row = f.db.prepare('SELECT teacher_confirmed_classification FROM questions WHERE id=2').get()!; const invalid = JSON.parse(String(row.teacher_confirmed_classification)); invalid.knowledge_points = [];
    f.db.prepare('UPDATE questions SET teacher_confirmed_classification=? WHERE id=2').run(JSON.stringify(invalid)); const bad = await f.store.preview(2, 1); await assert.rejects(f.store.add(2, 1, bad.snapshot, bad.text), /有效/);
  } finally { f.db.close(); }
});
test('concurrent retries converge on one identity, revision and source mapping', async () => {
  const f = fixture(); try { const p = await f.store.preview(1, 1); const results = await Promise.all([f.store.add(1, 1, p.snapshot, p.text), f.store.add(1, 1, p.snapshot, p.text)]); assert.equal(results[0].canonicalId, results[1].canonicalId); for (const table of ['canonical_questions', 'canonical_question_revisions', 'source_documents', 'question_occurrences', 'question_module_links']) assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n, 1); } finally { f.db.close(); }
});
test('scope ownership changed during import cannot receive student contents', async () => {
  const f = fixture(); try { const p = await f.store.preview(1, 1); f.race(() => f.db.prepare("UPDATE question_library_scopes SET owner_principal_id='OTHER' WHERE id='s'").run()); await assert.rejects(f.store.add(1, 1, p.snapshot, p.text), /未完成/); assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_questions').get()!.n, 0); } finally { f.db.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import * as schema from '../db/schema';

const migration = readFileSync(new URL('../drizzle/0015_canonical_identity_layer.sql', import.meta.url), 'utf8');
const names = ['question_library_scopes','canonical_questions','canonical_question_revisions','source_documents','question_occurrences','question_module_links'];
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE questions(id INTEGER PRIMARY KEY); CREATE TABLE papers(id TEXT PRIMARY KEY); CREATE TABLE paper_questions(id TEXT PRIMARY KEY); CREATE TABLE english_papers(id TEXT PRIMARY KEY); CREATE TABLE english_questions(id TEXT PRIMARY KEY);');
  db.exec(migration);
  db.exec(`INSERT INTO question_library_scopes(id,code,name,scope_type,kind) VALUES ('s','private-s','synthetic','legacy_private','private'),('s2','private-s2','synthetic2','student_private','private');
    INSERT INTO canonical_questions(id,scope_id) VALUES ('c','s'),('c2','s'),('c3','s2');
    INSERT INTO source_documents(id,scope_id,source_type,title) VALUES ('d','s','student_upload','synthetic');`);
  return db;
}
function revision(db: DatabaseSync, id: string, canonical = 'c', number = 1) {
  db.prepare(`INSERT INTO canonical_question_revisions(id,canonical_question_id,revision,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,change_reason) VALUES (?,?,?,'x','x','same-hash','math-v1','norm-v1','{}','synthetic')`).run(id, canonical, number);
}
function occurrence(db: DatabaseSync, id: string, canonical = 'c') {
  db.prepare(`INSERT INTO question_occurrences(id,canonical_question_id,source_document_id,source_type,occurrence_key) VALUES (?,?,'d','student_upload',?)`).run(id, canonical, id);
}

test('six exported Drizzle tables, additive SQL and all prior migrations remain compatible', () => {
  for (const key of ['questionLibraryScopes','canonicalQuestions','canonicalQuestionRevisions','sourceDocuments','questionOccurrences','questionModuleLinks']) {
    const config = getTableConfig(schema[key as keyof typeof schema] as Parameters<typeof getTableConfig>[0]);
    assert.ok(names.includes(config.name));
  }
  assert.doesNotMatch(migration, /\b(?:ALTER|DROP|INSERT|UPDATE|DELETE|REPLACE)\s+(?:TABLE|INTO|FROM|["`])/i);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
    for (const name of names) assert.equal(db.prepare(`SELECT count(*) n FROM "${name}"`).get()?.n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok');
  } finally { db.close(); }
});

test('scope boundaries, multiple revisions and repeated hashes are preserved', () => {
  const db = fixture();
  try {
    revision(db, 'r1'); revision(db, 'r2', 'c', 2); revision(db, 'r3', 'c3');
    assert.equal(db.prepare('SELECT count(*) n FROM canonical_questions WHERE scope_id=?').get('s')?.n, 2);
    assert.equal(db.prepare('SELECT count(*) n FROM canonical_question_revisions WHERE normalized_hash=?').get('same-hash')?.n, 3);
    assert.throws(() => revision(db, 'r4', 'c', 2), /UNIQUE/);
    assert.throws(() => db.exec(`INSERT INTO question_library_scopes(id,code,name,scope_type,kind,ownership_status) VALUES ('bad','bad','bad','teacher_private','private','known')`), /CHECK/);
    db.exec(`UPDATE canonical_questions SET status='merged',redirect_to_id='c2' WHERE id='c'`);
    assert.throws(() => db.exec(`UPDATE canonical_questions SET redirect_to_id='c3' WHERE id='c'`), /FOREIGN KEY/);
  } finally { db.close(); }
});

test('nullable current pointer is safe; current and previous revision must belong to same identity', () => {
  const db = fixture();
  try {
    revision(db,'r1'); revision(db,'r2','c',2); revision(db,'other','c2');
    db.exec(`UPDATE canonical_questions SET current_revision_id='r2' WHERE id='c'; UPDATE canonical_question_revisions SET supersedes_id='r1' WHERE id='r2'`);
    assert.throws(() => db.exec(`UPDATE canonical_questions SET current_revision_id='other' WHERE id='c'`), /FOREIGN KEY/);
    assert.throws(() => db.exec(`UPDATE canonical_question_revisions SET supersedes_id='other' WHERE id='r2'`), /FOREIGN KEY/);
    assert.throws(() => db.exec(`DELETE FROM canonical_question_revisions WHERE id='r2'`), /FOREIGN KEY/);
    assert.throws(() => db.exec(`UPDATE canonical_question_revisions SET payload='not-json' WHERE id='r1'`));
  } finally { db.close(); }
});

test('multiple occurrences, source type, content revision and deletion restrictions', () => {
  const db = fixture();
  try {
    revision(db,'r1'); revision(db,'other','c2'); occurrence(db,'o'); occurrence(db,'o2');
    assert.equal(db.prepare('SELECT count(*) n FROM question_occurrences WHERE canonical_question_id=?').get('c')?.n, 2);
    db.exec(`UPDATE question_occurrences SET content_revision_id='r1' WHERE id='o'`);
    assert.throws(() => db.exec(`UPDATE question_occurrences SET content_revision_id='other' WHERE id='o'`), /FOREIGN KEY/);
    assert.throws(() => db.exec(`UPDATE question_occurrences SET source_type='math_paper' WHERE id='o'`), /FOREIGN KEY/);
    for (const sql of [`DELETE FROM canonical_questions WHERE id='c'`,`DELETE FROM source_documents WHERE id='d'`,`DELETE FROM question_library_scopes WHERE id='s'`]) assert.throws(() => db.exec(sql), /FOREIGN KEY/);
    assert.throws(() => db.exec(`UPDATE question_occurrences SET page=0 WHERE id='o'`), /CHECK/);
  } finally { db.close(); }
});

test('integer/text/UUID legacy bridges, uniqueness, rebind and tombstones', () => {
  const db = fixture();
  try {
    occurrence(db,'o'); occurrence(db,'other','c2');
    db.exec(`INSERT INTO questions VALUES (8); INSERT INTO paper_questions VALUES ('550e8400-e29b-41d4-a716-446655440000'); INSERT INTO english_questions VALUES ('reading-A-21');`);
    const records = [['student_question','8','legacy_student_question_id'],['paper_question','550e8400-e29b-41d4-a716-446655440000','legacy_paper_question_id'],['english_question','reading-A-21','legacy_english_question_id']];
    for (const [type,id,col] of records) db.prepare(`INSERT INTO question_module_links(id,module_type,module_record_id,canonical_question_id,occurrence_id,${col},observed_source_hash) VALUES (?,?,?,'c','o',?,'synthetic')`).run(type,type,id,id);
    assert.throws(() => db.exec(`INSERT INTO question_module_links(id,module_type,module_record_id,canonical_question_id,occurrence_id,observed_source_hash) VALUES ('dup','student_question','8','c','o','hash')`), /UNIQUE/);
    assert.throws(() => db.exec(`UPDATE question_module_links SET canonical_question_id='c2' WHERE id='student_question'`), /FOREIGN KEY/);
    assert.throws(() => db.exec(`UPDATE question_module_links SET module_record_id='9' WHERE id='student_question'`), /CHECK/);
    db.exec(`UPDATE question_module_links SET canonical_question_id='c2',occurrence_id='other',mapping_revision=2 WHERE id='student_question' AND mapping_revision=1`);
    assert.equal(db.prepare(`SELECT mapping_revision FROM question_module_links WHERE id='student_question'`).get()?.mapping_revision,2);
    assert.throws(() => db.exec(`DELETE FROM question_occurrences WHERE id='other'`), /FOREIGN KEY/);
    db.exec(`DELETE FROM questions; DELETE FROM paper_questions; DELETE FROM english_questions;`);
    assert.equal(db.prepare('SELECT count(*) n FROM question_module_links WHERE legacy_student_question_id IS NULL AND legacy_paper_question_id IS NULL AND legacy_english_question_id IS NULL').get()?.n,3);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('old paper deletion retains source snapshot and migration replay preserves records/schema', () => {
  const db = fixture();
  try {
    db.exec(`INSERT INTO papers VALUES ('p'); INSERT INTO english_papers VALUES ('ep');
      INSERT INTO source_documents(id,scope_id,source_type,title,math_paper_id,legacy_source_key) VALUES ('math','s','math_paper','math','p','p');
      INSERT INTO source_documents(id,scope_id,source_type,title,english_paper_id,legacy_source_key) VALUES ('english','s','english_paper','english','ep','ep');
      DELETE FROM papers; DELETE FROM english_papers;`);
    assert.equal(db.prepare(`SELECT legacy_source_key FROM source_documents WHERE id='math'`).get()?.legacy_source_key,'p');
    assert.equal(db.prepare(`SELECT english_paper_id FROM source_documents WHERE id='english'`).get()?.english_paper_id,null);
    revision(db,'r'); occurrence(db,'o');
    const before = JSON.stringify(db.prepare('SELECT * FROM sqlite_master ORDER BY type,name').all());
    db.exec(migration);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM sqlite_master ORDER BY type,name').all()),before);
    assert.equal(db.prepare('SELECT count(*) n FROM canonical_question_revisions').get()?.n,1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');
  } finally { db.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { knowledgeNodes, knowledgeEdges, questionKnowledgeRelation } from '../db/schema';

const folder = new URL('../drizzle/', import.meta.url);
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync(folder).filter(n => n.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(name, folder), 'utf8'));
  }
  return db;
}
function node(db: DatabaseSync, id: string, level = 3) {
  db.prepare('INSERT INTO knowledge_nodes(id,code,name,level) VALUES (?,?,?,?)').run(id, id, '测试知识点', level);
}

test('catalog migration is additive and exported models match migrated columns', () => {
  const sql = readFileSync(new URL('0023_mathematics_knowledge_catalog.sql', folder), 'utf8');
  for (const statement of sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) {
    assert.match(statement, /^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\b/);
  }
  const db = fixture();
  try {
    for (const table of [knowledgeNodes, knowledgeEdges, questionKnowledgeRelation]) {
      const config = getTableConfig(table);
      const columns = db.prepare(`PRAGMA table_info('${config.name}')`).all().map(r => r.name);
      assert.deepEqual(columns, config.columns.map(c => c.name));
    }
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok');
  } finally { db.close(); }
});

test('nodes default to pending and enforce identity, levels, metadata and explicit review', () => {
  const db = fixture();
  try {
    node(db, 'a');
    assert.equal(db.prepare('SELECT knowledge_review_status FROM knowledge_nodes').get()?.knowledge_review_status, 'pending');
    for (const assignment of ["level=0", "level=6", "difficulty=2.5", "difficulty=8", "importance='invalid'", "exam_frequency='invalid'", "metadata='[]'", "code=' '", "source='unknown'", "knowledge_review_status='approved'", "knowledge_review_status='rejected'"]) {
      assert.throws(() => db.exec(`UPDATE knowledge_nodes SET ${assignment} WHERE id='a'`), /CHECK/);
    }
    assert.throws(() => node(db, 'a'), /UNIQUE/);
    db.exec("UPDATE knowledge_nodes SET knowledge_review_status='approved',reviewed_by='teacher',reviewed_at=CURRENT_TIMESTAMP WHERE id='a'");
    assert.equal(db.prepare("SELECT count(*) n FROM knowledge_nodes WHERE knowledge_review_status='approved'").get()?.n, 1);
  } finally { db.close(); }
});

test('edges enforce endpoints, uniqueness, relation types and deletion protection', () => {
  const db = fixture();
  try {
    node(db, 'a'); node(db, 'b');
    const insert = db.prepare('INSERT INTO knowledge_edges(id,source_id,target_id,relation_type) VALUES (?,?,?,?)');
    insert.run('e', 'a', 'b', 'belongs_to');
    assert.throws(() => insert.run('dup', 'a', 'b', 'belongs_to'), /UNIQUE/);
    assert.throws(() => insert.run('self', 'a', 'a', 'related'), /CHECK/);
    assert.throws(() => insert.run('missing', 'a', 'missing', 'related'), /FOREIGN KEY/);
    assert.throws(() => insert.run('type', 'b', 'a', 'invalid'), /CHECK/);
    assert.throws(() => db.exec("UPDATE knowledge_edges SET knowledge_review_status='approved'"), /CHECK/);
    assert.throws(() => db.exec("DELETE FROM knowledge_nodes WHERE id='a'"), /FOREIGN KEY/);
  } finally { db.close(); }
});

test('question links support weighted concepts while preserving canonical scope boundaries', () => {
  const db = fixture();
  try {
    db.exec("INSERT INTO question_library_scopes(id,code,name,scope_type,kind) VALUES ('s','s','test','legacy_private','private'),('other','other','test','legacy_private','private'); INSERT INTO canonical_questions(id,scope_id) VALUES ('q','s')");
    node(db, 'a'); node(db, 'b');
    const insert = db.prepare('INSERT INTO question_knowledge_relation(question_id,knowledge_id,scope_id,weight) VALUES (?,?,?,?)');
    insert.run('q', 'a', 's', 0.6); insert.run('q', 'b', 's', 0.4);
    assert.equal(db.prepare('SELECT sum(weight) n FROM question_knowledge_relation').get()?.n, 1);
    assert.throws(() => insert.run('q', 'a', 's', 0.5), /UNIQUE/);
    for (const weight of [0, -0.1, 1.1]) assert.throws(() => db.prepare('UPDATE question_knowledge_relation SET weight=?').run(weight), /CHECK/);
    assert.throws(() => db.exec("UPDATE question_knowledge_relation SET scope_id='other'"), /FOREIGN KEY/);
    assert.throws(() => db.exec("UPDATE question_knowledge_relation SET question_id='missing'"), /FOREIGN KEY/);
    assert.throws(() => db.exec("UPDATE question_knowledge_relation SET knowledge_review_status='approved'"), /CHECK/);
    assert.throws(() => db.exec("UPDATE question_knowledge_relation SET role='invalid'"), /CHECK/);
    assert.throws(() => db.exec("DELETE FROM canonical_questions WHERE id='q'"), /FOREIGN KEY/);
  } finally { db.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { validateCatalog, validateGraph, summarizeCatalog, type KnowledgeCatalog } from '../lib/knowledge_graph/catalog';
import { importKnowledgeCatalog } from '../lib/knowledge_graph/seed-store';

const input = JSON.parse(readFileSync(new URL('../data/knowledge_graph/senior-math-v1.json', import.meta.url), 'utf8'));
const catalog = validateCatalog(input);
const clone = (): KnowledgeCatalog => structuredClone(catalog);
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const folder = new URL('../drizzle/', import.meta.url);
  for (const name of readdirSync(folder).filter(n => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(name, folder), 'utf8'));
  return db;
}
const nodeId = (code: string) => catalog.nodes.find(n => n.code === code)!.id;
const counts = (db: DatabaseSync) => [db.prepare('SELECT count(*) n FROM knowledge_nodes').get()?.n, db.prepare('SELECT count(*) n FROM knowledge_edges').get()?.n];

test('authored seed exceeds 300 nodes and every chapter reaches exam points and task types', () => {
  const summary = summarizeCatalog(catalog);
  assert.equal(summary.nodes, 392);
  assert.deepEqual(summary.levels, { 1: 1, 2: 11, 3: 76, 4: 152, 5: 152 });
  assert.deepEqual(summary.chapters.map(c => c.name), ['集合与逻辑', '函数', '三角函数', '数列', '平面向量', '不等式', '立体几何', '解析几何', '概率统计', '导数', '复数']);
  assert.equal(summary.relations.belongs_to, summary.nodes - 1);
  assert.ok(summary.relations.prerequisite > 0 && summary.relations.related > 0 && summary.relations.advanced > 0);
  assert.ok(catalog.nodes.every(n => n.description.length >= 10 && n.exam_frequency === null && n.knowledge_review_status === 'pending'));
  assert.equal(new Set(catalog.nodes.filter(n => n.level === 5).map(n => n.name)).size, 152);
});

test('invalid seed shape, identity, endpoint, levels, duplicates and orphan content are rejected', () => {
  const mutations: Array<(c: KnowledgeCatalog) => void> = [
    c => { c.nodes[1].code = c.nodes[0].code; },
    c => { c.nodes[1].metadata.dataset_id = 'other'; },
    c => { c.edges[0].target_id = 'missing'; },
    c => { c.edges[0].target_id = c.edges[0].source_id; },
    c => { c.nodes[1].level = 4; },
    c => { c.nodes[1].stage = 'junior_high'; },
    c => { c.edges.push({ ...c.edges[0], id: 'duplicate' }); },
    c => { c.edges = c.edges.filter(e => e.source_id !== nodeId('SETS.SET.E1.T1')); },
    c => { c.nodes = c.nodes.filter(n => n.id !== nodeId('SETS.SET.E1.T1')); c.edges = c.edges.filter(e => e.source_id !== nodeId('SETS.SET.E1.T1')); },
  ];
  for (const mutate of mutations) { const data = clone(); mutate(data); assert.throws(() => validateCatalog(data)); }
  const approved = clone();
  Object.assign(approved.nodes[0], { knowledge_review_status: 'approved' });
  assert.throws(() => validateCatalog(approved));
});

test('inverse hierarchy, multiple parents, reversed related edges and dependency cycles are rejected', () => {
  const data = clone();
  const edge = data.edges[0];
  assert.throws(() => validateGraph(data.nodes, [...data.edges, { ...edge, id: 'inverse', source_id: edge.target_id, target_id: edge.source_id, relation_type: 'contains' }]), /Duplicate inverse/);
  assert.throws(() => validateGraph(data.nodes, [...data.edges, { ...edge, id: 'parent', source_id: nodeId('SETS.SET'), target_id: nodeId('FUNC') }]), /Multiple hierarchy/);
  const related = data.edges.find(e => e.relation_type === 'related')!;
  assert.throws(() => validateGraph(data.nodes, [...data.edges, { ...related, id: 'reverse', source_id: related.target_id, target_id: related.source_id }]), /sorted/);
  assert.throws(() => validateGraph(data.nodes, [...data.edges, { ...edge, id: 'cycle', source_id: nodeId('DERIV.DEFINITION'), target_id: nodeId('DERIV.RULE'), relation_type: 'prerequisite' }]), /cycle/);
  assert.throws(() => validateGraph(data.nodes, [...data.edges, { ...edge, id: 'advanced-cycle', source_id: nodeId('DERIV.RULE'), target_id: nodeId('DERIV.DEFINITION'), relation_type: 'advanced' }]), /cycle/);
});

test('transactional import is repeatable and preserves teacher edits, review decisions and legacy rows', () => {
  const db = fixture();
  try {
    db.exec("INSERT INTO knowledge_points(code,name,chapter_code) VALUES ('legacy','原知识点','original')");
    const legacy = db.prepare('SELECT * FROM knowledge_points').all();
    const first = importKnowledgeCatalog(db, catalog);
    assert.equal(first.insertedNodes, 392); assert.equal(first.insertedEdges, 426);
    db.prepare("UPDATE knowledge_nodes SET name='教师编辑名称',description='教师修订内容',importance='high',knowledge_review_status='approved',reviewed_by='teacher',reviewed_at='2026-10-14',updated_at='edited' WHERE id=?").run(nodeId('FUNC.DOMAIN'));
    db.prepare("UPDATE knowledge_edges SET description='教师修订关系',knowledge_review_status='approved',reviewed_by='teacher',reviewed_at='2026-10-14' WHERE id=?").run(catalog.edges[0].id);
    const beforeNodes = db.prepare('SELECT * FROM knowledge_nodes ORDER BY id').all();
    const beforeEdges = db.prepare('SELECT * FROM knowledge_edges ORDER BY id').all();
    const second = importKnowledgeCatalog(db, catalog);
    assert.equal(second.insertedNodes, 0); assert.equal(second.insertedEdges, 0);
    assert.equal(second.preservedNodes, 392); assert.equal(second.preservedEdges, 426);
    assert.deepEqual(db.prepare('SELECT * FROM knowledge_nodes ORDER BY id').all(), beforeNodes);
    assert.deepEqual(db.prepare('SELECT * FROM knowledge_edges ORDER BY id').all(), beforeEdges);
    assert.deepEqual(db.prepare('SELECT * FROM knowledge_points').all(), legacy);
    assert.equal(db.prepare('SELECT count(*) n FROM question_knowledge_relation').get()?.n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('mid-import database failure rolls back every node and edge', () => {
  const db = fixture();
  try {
    db.exec("CREATE TRIGGER fail_seed BEFORE INSERT ON knowledge_edges WHEN NEW.relation_type='prerequisite' BEGIN SELECT RAISE(ABORT,'injected failure'); END");
    assert.throws(() => importKnowledgeCatalog(db, catalog), /injected failure/);
    assert.deepEqual(counts(db), [0, 0]);
  } finally { db.close(); }
});

test('identity collision refuses to overwrite existing records and rolls back earlier inserts', () => {
  const db = fixture();
  try {
    db.prepare("INSERT INTO knowledge_nodes(id,code,name,level) VALUES ('manual',?,'保留',3)").run('COMPLEX.MODULUS');
    assert.throws(() => importKnowledgeCatalog(db, catalog), /identity conflict/);
    assert.deepEqual(counts(db), [1, 0]);
    assert.equal(db.prepare('SELECT name FROM knowledge_nodes').get()?.name, '保留');
  } finally { db.close(); }
});

test('merged graph cycle from a pre-existing edge is detected inside the transaction', () => {
  const db = fixture();
  try {
    importKnowledgeCatalog(db, catalog);
    db.prepare("INSERT INTO knowledge_edges(id,source_id,target_id,relation_type) VALUES ('teacher-edge',?,?,'prerequisite')").run(nodeId('DERIV.DEFINITION'), nodeId('DERIV.RULE'));
    assert.throws(() => importKnowledgeCatalog(db, catalog), /cycle/);
    assert.deepEqual(counts(db), [392, 427]);
  } finally { db.close(); }
});

test('import refuses disabled foreign keys', () => {
  const db = fixture();
  try { db.exec('PRAGMA foreign_keys=OFF'); assert.throws(() => importKnowledgeCatalog(db, catalog), /Foreign keys/); }
  finally { db.close(); }
});

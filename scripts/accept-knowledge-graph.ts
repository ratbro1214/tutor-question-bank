// Read actual local data; initialize only explicitly marked teacher-reviewable pilot concepts.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { KnowledgeGraphStore } from '../lib/knowledge-graph-store';
import { initializePilot } from '../lib/knowledge-graph-pilot';
import { assertStopped, projectRoot } from './project-data.mjs';
await assertStopped(projectRoot);
const dir = resolve(projectRoot, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const files = readdirSync(dir).filter(n => n.endsWith('.sqlite') && n !== 'metadata.sqlite'); if (files.length !== 1) throw Error('Local database selection is ambiguous.');
const db = new DatabaseSync(resolve(dir, files[0])); db.exec('PRAGMA foreign_keys=ON');
const binding = { prepare(sql: string) { let values: unknown[] = []; const s = { bind(...v: unknown[]) { values = v; return s; }, async first() { return db.prepare(sql).get(...values as []) || null; }, async all() { return { results: db.prepare(sql).all(...values as []) }; }, run() { return { meta: { changes: db.prepare(sql).run(...values as []).changes } }; } }; return s; }, async batch(statements: { run(): unknown }[]) { db.exec('BEGIN IMMEDIATE'); try { const r = statements.map(s => s.run()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } } as unknown as D1Database;
try {
  const scope = db.prepare("SELECT id FROM question_library_scopes WHERE code='project-private' AND owner_principal_id='project_owner'").get()?.id; if (!scope) throw Error('Verified project-private scope is missing.');
  const store = new KnowledgeGraphStore(binding, 'local_seedy', [String(scope)]);
  const before = { canonical: db.prepare('SELECT count(*) n FROM canonical_questions').get()!.n, papers: db.prepare('SELECT count(*) n FROM papers').get()!.n, lessons: db.prepare('SELECT count(*) n FROM lesson_plans').get()!.n };
  const start = performance.now(), seed = await initializePilot(store, String(scope)), repeated = await initializePilot(store, String(scope)), seedMs = performance.now() - start;
  const readStart = performance.now(), graph = await store.snapshot('高中', 'HS-DERIVATIVE', false), graphMs = performance.now() - readStart;
  const resources = await store.questions({ knowledge: 'HS-DERIVATIVE-MONOTONICITY', approved: false });
  const official = await store.questions({ knowledge: 'HS-DERIVATIVE-MONOTONICITY' });
  const after = { canonical: db.prepare('SELECT count(*) n FROM canonical_questions').get()!.n, papers: db.prepare('SELECT count(*) n FROM papers').get()!.n, lessons: db.prepare('SELECT count(*) n FROM lesson_plans').get()!.n };
  const reportPath = resolve(projectRoot, '../outputs/5C-真实数据验收.json'), previous = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const report = { owner: 'local_seedy', scope, initialSeed: previous?.initialSeed || previous?.seed || seed, seed, repeated, before, after, preservedCounts: JSON.stringify(before) === JSON.stringify(after), knowledgeNodes: graph.knowledge.length, methodCards: graph.methods.length, relationCount: graph.relations.length, actualMatchingQuestions: resources.total, reviewedQuestions: official.items.length,
    accepted5BReviews: db.prepare("SELECT count(*) n FROM paper_solution_reviews WHERE teacher_status='accepted'").get()!.n, timings: { seedMs, graphMs }, initialGraphContainsQuestions: 'questions' in graph, foreignKeys: db.prepare('PRAGMA foreign_key_check').all(), integrity: db.prepare('PRAGMA integrity_check').get() };
  writeFileSync(reportPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { db.close(); }

import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { assertStopped, projectRoot } from './project-data.mjs';

const target = resolve(process.argv[2] || ''), allowed = resolve(projectRoot, '.wrangler/state/v3/d1');
const rel = relative(allowed, target);
if (!process.argv[2] || !rel || rel.startsWith('..') || isAbsolute(rel) || !target.endsWith('.sqlite')) throw Error('Provide the verified project local D1 SQLite path.');
await assertStopped(projectRoot);
const out = resolve(projectRoot, '../outputs'), folder = resolve(out, '5C-数据库备份-' + Date.now()); await mkdir(folder, { recursive: true });
const db = new DatabaseSync(target); db.exec('PRAGMA foreign_keys=ON');
const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'math_%'").all().map(r => r.name);
const snapshot = () => Object.fromEntries(names.map(n => [n, { count: db.prepare('SELECT count(*) n FROM "' + n + '"').get().n, hash: createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM "' + n + '" ORDER BY rowid').all())).digest('hex') }]));
try {
  const before = snapshot(); await backup(db, resolve(folder, 'before.sqlite'));
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE name='math_methods'").get();
  const migrations = exists ? [] : ['0020_math_knowledge_graph.sql'];
  db.exec('BEGIN IMMEDIATE'); try { for (const name of migrations) db.exec(await readFile(resolve(projectRoot, 'drizzle', name), 'utf8')); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  const after = snapshot(), unchanged = JSON.stringify(before) === JSON.stringify(after), foreign = db.prepare('PRAGMA foreign_key_check').all(), integrity = db.prepare('PRAGMA integrity_check').get();
  if (!unchanged || foreign.length || integrity.integrity_check !== 'ok') throw Error('Migration preservation check failed; backup retained.');
  const report = { database: target, backup: resolve(folder, 'before.sqlite'), migrations, oldTablesUnchanged: unchanged, before, after, foreignKeys: foreign, integrity };
  await writeFile(resolve(out, '5C-迁移核验.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ migrations, backup: report.backup, oldTablesUnchanged: unchanged, integrity }, null, 2));
} finally { db.close(); }

import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog, summarizeCatalog } from '../lib/knowledge_graph/catalog';
import { importKnowledgeCatalog } from '../lib/knowledge_graph/seed-store';
import { assertStopped } from './project-data.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const mode = args[0] ?? '--validate';
if (!['--validate', '--preview', '--database'].includes(mode) || (mode === '--database' ? args.length !== 2 : args.length > 1)) {
  throw Error('Usage: node --import tsx scripts/knowledge-catalog.ts [--validate | --preview | --database EXISTING_SQLITE_PATH]');
}
const catalog = validateCatalog(JSON.parse(await readFile(resolve(root, 'data/knowledge_graph/senior-math-v1.json'), 'utf8')));
const summary = summarizeCatalog(catalog);
if (mode === '--validate') {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const runId = `${Date.now()}-${process.pid}`;
  const output = resolve(root, '../outputs/knowledge-graph-phase2', runId);
  let target: string;
  if (mode === '--preview') {
    const folder = resolve(root, '../work/knowledge-graph-phase2', runId);
    await mkdir(folder, { recursive: true });
    target = resolve(folder, 'catalog-preview.sqlite');
  } else {
    // Resolve symlinks before checking containment; never create a missing business database.
    target = await realpath(resolve(args[1]));
    const project = await realpath(root);
    const rel = relative(project, target);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || !target.endsWith('.sqlite') || !(await stat(target)).isFile()) throw Error('Expected an existing SQLite database inside this project');
    await assertStopped(root);
  }
  await mkdir(output, { recursive: true });
  const db = new DatabaseSync(target);
  try {
    db.exec('PRAGMA foreign_keys=ON');
    let backupFile: string | null = null;
    const migrations: string[] = [];
    const legacyNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('knowledge_nodes','knowledge_edges','question_knowledge_relation') ORDER BY name").all().map(r => String(r.name));
    const fingerprint = () => Object.fromEntries(legacyNames.map(name => {
      const escaped = name.replaceAll('"', '""');
      const rows = db.prepare(`SELECT * FROM "${escaped}" ORDER BY rowid`).all();
      return [name, { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') }];
    }));
    const before = fingerprint();
    if (mode === '--database') {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='canonical_questions'").get()) throw Error('Canonical question library prerequisite is missing');
      backupFile = resolve(output, 'before.sqlite');
      await backup(db, backupFile);
    }
    const files = mode === '--preview'
      ? (await readdir(resolve(root, 'drizzle'))).filter(n => n.endsWith('.sql')).sort()
      : ['0023_mathematics_knowledge_catalog.sql'];
    const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('knowledge_nodes','knowledge_edges','question_knowledge_relation')").all();
    if (existing.length !== 0 && existing.length !== 3) throw Error('Partial catalog schema detected; refusing automatic repair');
    if (existing.length === 0) {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const file of files) { db.exec(await readFile(resolve(root, 'drizzle', file), 'utf8')); migrations.push(file); }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    // Phase 3 provenance is additive; old Phase 2 preview databases can be upgraded too.
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='knowledge_relation_evidence'").get()) {
      const file = '0024_knowledge_attachment_evidence.sql';
      db.exec('BEGIN IMMEDIATE');
      try { db.exec(await readFile(resolve(root, 'drizzle', file), 'utf8')); db.exec('COMMIT'); migrations.push(file); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    const first = importKnowledgeCatalog(db, catalog);
    const second = importKnowledgeCatalog(db, catalog);
    if (second.insertedNodes || second.insertedEdges) throw Error('Idempotency check failed');
    const after = fingerprint();
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    const integrity = db.prepare('PRAGMA integrity_check').get()?.integrity_check;
    if (JSON.stringify(before) !== JSON.stringify(after) || foreignKeys.length || integrity !== 'ok') throw Error('Database preservation or integrity check failed');
    const report = { mode, database: target, backup: backupFile, migrations, summary, firstImport: first, secondImport: second, oldTablesUnchanged: true, before, after, foreignKeys, integrity, businessDatabaseChanged: mode === '--database' };
    await writeFile(resolve(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(resolve(output, 'senior-math-v1.json'), JSON.stringify(catalog, null, 2) + '\n');
    const lines = ['# 高中数学知识库 · Phase 2', '', `共 ${summary.nodes} 个节点、${summary.edges} 条关系。状态：待审核。`, '', '| 章节 | 节点数（含章节） |', '| --- | ---: |', ...summary.chapters.map(c => `| ${c.name} | ${c.nodes} |`), '', `数据库：${target}`, '', mode === '--preview' ? '本次为独立预览导入，未修改业务数据库。' : '业务库已备份并完成导入。', '', '重复导入新增节点和关系均为 0；旧表记录一致；外键与数据库完整性检查通过。'];
    await writeFile(resolve(output, '验收说明.md'), lines.join('\n') + '\n');
    console.log(JSON.stringify({ output, ...report }, null, 2));
  } finally { db.close(); }
}

import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { assertStopped } from './project-data.mjs';
import { buildPaperCanonicalPreview, CANONICAL_TABLES, renderPaperPreviewMarkdown } from '../lib/paper-canonical-preview.mjs';
import { buildPaperCanonicalReview, renderPaperReviewMarkdown } from '../lib/paper-canonical-review.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = file => fs.stat(file).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
const quote = name => '"' + name.replaceAll('"', '""') + '"';
// All database statements must pass this gate. Connections are opened readOnly as a second guard.
function select(db, sql) {
  if (!/^SELECT\s/i.test(sql) || /;|\b(?:ATTACH|DETACH|PRAGMA|INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|VACUUM)\b/i.test(sql)) throw Error('Only a single SELECT is allowed');
  return db.prepare(sql).all();
}
async function walk(directory) {
  const result = [];
  for (const e of await fs.readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    const full = path.join(directory, e.name);
    if (e.isSymbolicLink()) throw Error('Symlinks/junctions are not allowed in business state: ' + full);
    if (e.isDirectory()) result.push(...await walk(full)); else if (e.isFile()) result.push(full); else throw Error('Unsupported state asset');
  }
  return result.sort();
}
async function noLinks(file) {
  let cursor = path.parse(file).root;
  for (const segment of file.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const info = await fs.lstat(cursor).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (info?.isSymbolicLink()) throw Error('Symlink/junction paths are not allowed: ' + cursor);
  }
}
async function assetFingerprints(root, database) {
  const d1 = await walk(path.join(root, '.wrangler/state/v3/d1'));
  const r2 = await walk(path.join(root, '.wrangler/state/v3/r2'));
  const databaseFiles = [...new Set([...d1, database, database + '-wal'].filter(file => !file.endsWith('-shm')))];
  const hashes = async files => {
    const result = {};
    for (const file of files.sort()) if (await exists(file)) result[path.relative(root, file).split(path.sep).join('/')] = digest(await fs.readFile(file));
    return result;
  };
  // SHM contains transient reader coordination; it is not a business object or committed WAL data.
  return { database_and_wal: await hashes(databaseFiles), r2_objects_mapping_and_wal: await hashes(r2.filter(file => !file.endsWith('-shm'))),
    excluded_transient_files: 'SQLite -shm only; main SQLite, WAL and all R2 binary objects are fingerprinted' };
}
function readDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = select(db, "SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name");
    const counts = Object.fromEntries(tables.map(t => [t.name, select(db, 'SELECT count(*) AS count FROM ' + quote(t.name))[0].count]));
    for (const name of ['papers','paper_questions',...CANONICAL_TABLES]) if (counts[name] === undefined) throw Error('Required table is missing: ' + name);
    return { tables, counts, papers: select(db, 'SELECT * FROM papers ORDER BY id'), questions: select(db, 'SELECT * FROM paper_questions ORDER BY paper_id,question_number,id') };
  } finally { db.close(); }
}
async function readR2(root) {
  const files = (await walk(path.join(root, '.wrangler/state/v3/r2'))).filter(f => f.endsWith('.sqlite') && path.basename(f) !== 'metadata.sqlite');
  const objects = [];
  for (const file of files) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      if (select(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='_mf_objects'").length) {
        objects.push(...select(db, 'SELECT key,blob_id,size FROM _mf_objects ORDER BY key').map(row => ({ ...row, mapping_database: path.relative(root, file) })));
      }
    } finally { db.close(); }
  }
  if (!files.length) throw Error('No local R2 mapping database found; cannot prove R2 consistency');
  return objects;
}
async function discoverDatabase(root) {
  const files = (await walk(path.join(root, '.wrangler/state/v3/d1'))).filter(f => f.endsWith('.sqlite') && path.basename(f) !== 'metadata.sqlite');
  if (files.length !== 1) throw Error('Expected one application D1 database; use explicit --db=<file>');
  return files[0];
}

// Reused by review-artifact tooling; SELECT-only snapshot includes committed file fingerprints.
export async function capturePaperReviewState(root = projectRoot, database, { requireEmpty = true } = {}) {
  root = path.resolve(root);
  await noLinks(root); await assertStopped(root);
  database = database ? path.resolve(database) : await discoverDatabase(root);
  await noLinks(database);
  if (!await exists(database)) throw Error('Database does not exist');
  const files = await assetFingerprints(root, database);
  const data = readDatabase(database), objects = await readR2(root);
  for (const name of CANONICAL_TABLES) if (requireEmpty && data.counts[name] !== 0) throw Error('Canonical tables must remain empty: ' + name);
  return { root, database, files, ...data, objects };
}

export async function runPaperCanonicalPreview({ root = projectRoot, database, outputDirectory = path.resolve(projectRoot, '../outputs'), reportKind = 'mapping' } = {}) {
  if (!['mapping', 'human-review'].includes(reportKind)) throw Error('Unsupported report kind');
  root = path.resolve(root); outputDirectory = path.resolve(outputDirectory);
  await noLinks(root); await noLinks(outputDirectory);
  for (const relative of ['.wrangler', 'data', 'public', 'blobs', 'db', 'drizzle', 'backups']) {
    const protectedPath = path.join(root, relative);
    if (outputDirectory === protectedPath || outputDirectory.startsWith(protectedPath + path.sep)) throw Error('Report output overlaps protected business assets');
  }
  const basename = reportKind === 'human-review' ? '阶段2E-1-paper-canonical-review' : '阶段2D-paper-canonical-preview';
  const jsonFile = path.join(outputDirectory, basename + '.json');
  const markdownFile = path.join(outputDirectory, basename + '.md');
  if (await exists(jsonFile) || await exists(markdownFile)) throw Error('Reports already exist; use a new --output-dir to preserve previous reports');
  await assertStopped(root);
  database = database ? path.resolve(database) : await discoverDatabase(root);
  await noLinks(database);
  if (!await exists(database)) throw Error('Database does not exist');
  const beforeFiles = await assetFingerprints(root, database);
  const before = readDatabase(database);
  const r2Before = await readR2(root);
  for (const name of CANONICAL_TABLES) if (before.counts[name] !== 0) throw Error('Stage 2D requires empty canonical tables: ' + name);
  const options = { objectKeys: r2Before.map(o => o.key) };
  if (reportKind === 'human-review') {
    options.objectReferences = await Promise.all(r2Before.map(async object => {
      const paths = Object.keys(beforeFiles.r2_objects_mapping_and_wal).filter(file => file.endsWith('/blobs/' + object.blob_id));
      const localFile = paths.length === 1 ? path.resolve(root, paths[0]) : null;
      const size = localFile ? (await fs.stat(localFile)).size : null;
      return { key: object.key, blob_id: object.blob_id, mapping_database: object.mapping_database,
        local_file: localFile, blob_exists: paths.length > 0, blob_path_count: paths.length,
        expected_size: object.size, actual_size: size, size_matches: size === null ? 'unknown' : size === object.size };
    }));
  }
  const report = reportKind === 'human-review'
    ? buildPaperCanonicalReview(before.papers, before.questions, options)
    : buildPaperCanonicalPreview(before.papers, before.questions, options);
  const after = readDatabase(database);
  const r2After = await readR2(root);
  const afterFiles = await assetFingerprints(root, database);
  await assertStopped(root);
  assert.deepEqual(afterFiles, beforeFiles, 'Database/WAL or R2 fingerprint changed: preview FAILED');
  assert.deepEqual(after.counts, before.counts, 'Table counts changed: preview FAILED');
  assert.deepEqual(after.tables, before.tables, 'Database schema changed: preview FAILED');
  assert.deepEqual(after.papers, before.papers); assert.deepEqual(after.questions, before.questions);
  assert.deepEqual(r2After, r2Before, 'R2 mapping changed: preview FAILED');
  report.generated_at = new Date().toISOString();
  report.database_source = database;
  report.zero_write_verification = {
    passed: true, connection_mode: 'DatabaseSync readOnly:true', allowed_sql: 'SELECT only',
    before: { files: beforeFiles, table_counts: before.counts, r2_object_count: r2Before.length },
    after: { files: afterFiles, table_counts: after.counts, r2_object_count: r2After.length },
    database_and_wal_unchanged: true, old_table_counts_unchanged: true, schema_unchanged: true, paper_rows_unchanged: true,
    canonical_table_counts: Object.fromEntries(CANONICAL_TABLES.map(name => [name, after.counts[name]])), r2_unchanged: true,
  };
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(jsonFile, JSON.stringify(report, null, 2), { flag: 'wx' });
  await fs.writeFile(markdownFile, reportKind === 'human-review' ? renderPaperReviewMarkdown(report) : renderPaperPreviewMarkdown(report), { flag: 'wx' });
  return { report, jsonFile, markdownFile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = {};
    for (const argument of process.argv.slice(2)) {
      const match = argument.match(/^--(db|project-root|output-dir)=(.+)$/);
      if (!match) throw Error('Usage: node scripts/preview-paper-canonical-mapping.mjs [--db=<file>] [--project-root=<directory>] [--output-dir=<new directory>]');
      options[{ db: 'database', 'project-root': 'root', 'output-dir': 'outputDirectory' }[match[1]]] = match[2];
    }
    const result = await runPaperCanonicalPreview(options);
    console.log(JSON.stringify({ ...result.report.summary, data_quality: result.report.data_quality, zero_write: result.report.zero_write_verification.passed, json: result.jsonFile, markdown: result.markdownFile }, null, 2));
  } catch (error) { console.error('Preview FAILED: ' + error.message); process.exitCode = 1; }
}

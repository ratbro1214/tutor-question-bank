import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { backupProject, restoreProject, validateBackup, fingerprint, within } from './project-data.mjs';

const parent = path.resolve(import.meta.dirname, '../../work/data-backup-tests-' + randomUUID());
async function fixture(name) {
  const root = path.join(parent, name);
  const d1 = path.join(root, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const r2 = path.join(root, '.wrangler/state/v3/r2/miniflare-R2BucketObject');
  for (const dir of [d1, r2, 'data/english', 'public/english-exams', 'drizzle/meta']) await fs.mkdir(path.isAbsolute(dir) ? dir : path.join(root, dir), { recursive: true });
  const writer = new DatabaseSync(path.join(d1, 'application.sqlite'));
  writer.exec('PRAGMA journal_mode=WAL; CREATE TABLE students(id INTEGER PRIMARY KEY); CREATE TABLE questions(id INTEGER PRIMARY KEY, student_id INTEGER REFERENCES students(id)); INSERT INTO students VALUES(1); INSERT INTO questions VALUES(1,1);');
  // Preserve a synthetic crash-style database whose committed rows remain in WAL.
  const crash = path.join(parent, name + '-crash-image'); await fs.mkdir(crash, { recursive: true });
  for (const file of await fs.readdir(d1)) await fs.copyFile(path.join(d1, file), path.join(crash, file));
  writer.close();
  for (const file of await fs.readdir(crash)) await fs.copyFile(path.join(crash, file), path.join(d1, file));
  const map = new DatabaseSync(path.join(r2, 'objects.sqlite'));
  map.exec("CREATE TABLE _mf_objects(key TEXT PRIMARY KEY,blob_id TEXT,size INTEGER); INSERT INTO _mf_objects VALUES('questions/1/example','example-blob',3)"); map.close();
  await fs.mkdir(path.join(root, '.wrangler/state/v3/r2/site-creator-r2/blobs'), { recursive: true });
  await fs.writeFile(path.join(root, '.wrangler/state/v3/r2/site-creator-r2/blobs/example-blob'), 'abc');
  await fs.writeFile(path.join(root, 'data/english/manifest.json'), '{"papers":[]}');
  await fs.writeFile(path.join(root, 'public/english-exams/original.txt'), 'source material');
  await fs.writeFile(path.join(root, 'drizzle/meta/_journal.json'), '{"entries":[]}');
  await fs.mkdir(path.join(root, 'db'), { recursive: true });
  await fs.writeFile(path.join(root, 'db/canonical-schema.ts'), '// synthetic canonical schema metadata');
  await fs.writeFile(path.join(root, 'db/lesson-plan-schema.ts'), '// synthetic lesson schema metadata');
  return { root, writer: { close() {} } };
}
test('WAL snapshot, complete validation, isolated restore, overwrite refusal, corruption and force safety', async () => {
  const { root, writer } = await fixture('source');
  try {
    const before = await fingerprint(root);
    const result = await backupProject({ root, output: path.join(parent, 'backups') });
    assert.deepEqual(await fingerprint(root), before);
    assert.equal(result.manifest.keyTableCounts.questions, 1);
    assert.equal(result.manifest.r2ObjectCount, 1);
    assert.equal((await validateBackup(result.directory)).status, 'complete');
    await assert.rejects(restoreProject({ directory: result.directory, target: path.join(result.directory, 'nested-target') }), /Unsafe restore target/);
    const target = path.join(parent, 'restored');
    await restoreProject({ directory: result.directory, target });
    assert.equal(await fs.readFile(path.join(target, 'db/canonical-schema.ts'), 'utf8'), '// synthetic canonical schema metadata');
    assert.equal(await fs.readFile(path.join(target, 'db/lesson-plan-schema.ts'), 'utf8'), '// synthetic lesson schema metadata');
    const db = new DatabaseSync(path.join(target, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/application.sqlite'), { readOnly: true });
    assert.equal(db.prepare('SELECT count(*) n FROM questions').get().n, 1); db.close();
    const restoredBefore = await fingerprint(target);
    await assert.rejects(restoreProject({ directory: result.directory, target }), /already contains/);
    assert.deepEqual(await fingerprint(target), restoredBefore);
    const forced = await restoreProject({ directory: result.directory, target, force: true });
    assert.ok(forced.safetyBackup);
    assert.equal((await validateBackup(forced.safetyBackup)).status, 'complete');
    const file = result.manifest.files.find(f => f.kind === 'english-static');
    await fs.appendFile(within(result.directory, file.path), 'corruption');
    await assert.rejects(validateBackup(result.directory), /integrity mismatch/);
    await assert.rejects(restoreProject({ directory: result.directory, target, force: true }), /integrity mismatch/);
    assert.deepEqual(await fingerprint(root), before);
  } finally { writer.close(); }
});
test('missing objects fail the task; traversal and absent backup are rejected', async () => {
  assert.throws(() => within(parent, '../escape'), /escapes/);
  assert.throws(() => within(parent, 'E:\\escape'), /relative/);
  await assert.rejects(restoreProject({}), /required/);
  const { root, writer } = await fixture('missing-object');
  try {
    await fs.unlink(path.join(root, '.wrangler/state/v3/r2/site-creator-r2/blobs/example-blob'));
    await assert.rejects(backupProject({ root, output: path.join(parent, 'failed-backups') }), /Backup FAILED/);
    const directories = await fs.readdir(path.join(parent, 'failed-backups'));
    const manifest = JSON.parse(await fs.readFile(path.join(parent, 'failed-backups', directories[0], 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'failed');
    await assert.rejects(validateBackup(path.join(parent, 'failed-backups', directories[0])), /Incomplete/);
  } finally { writer.close(); }
});
test('backup rejects output inside live assets', async () => {
  const { root, writer } = await fixture('overlap');
  try { await assert.rejects(backupProject({ root, output: path.join(root, '.wrangler/state/backups') }), /overlaps/); }
  finally { writer.close(); }
});
test('open SQLite handle refuses backup before creating a backup directory', async () => {
  const { root } = await fixture('occupied');
  const reader = new DatabaseSync(path.join(root, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/application.sqlite'), { readOnly: true });
  const output = path.join(parent, 'occupied-backups');
  try {
    await assert.rejects(backupProject({ root, output }), /occupied or inaccessible/);
    await assert.rejects(fs.stat(output), { code: 'ENOENT' });
  } finally { reader.close(); }
  assert.throws(() => within(parent, '.wrangler/state/v3/d1/../../../../.dev.vars'), /unsafe/);
});
test.after(() => { console.log('Isolated test artifacts retained at:', parent); });

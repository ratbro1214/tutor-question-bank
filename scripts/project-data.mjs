import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const projectRoot = path.resolve(import.meta.dirname, '..');
const state = '.wrangler/state/v3';
const slash = value => value.split(path.sep).join('/');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const exists = async value => fs.lstat(value).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
export function within(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') || path.isAbsolute(relative)) throw Error('Invalid relative path');
  if (relative.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Path escapes or contains unsafe segments');
  const result = path.resolve(root, relative);
  const rel = path.relative(root, result);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Path escapes its root');
  return result;
}
async function noLinks(root, relative = '') {
  let cursor = path.parse(path.resolve(root)).root;
  for (const part of path.resolve(root, relative).slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (await exists(cursor) && (await fs.lstat(cursor)).isSymbolicLink()) throw Error('Symlink/junction is not allowed: ' + cursor);
  }
}
async function walk(root, relative) {
  const full = within(root, relative);
  if (!await exists(full)) return [];
  await noLinks(root, relative);
  const stat = await fs.lstat(full);
  if (stat.isFile()) return [slash(relative)];
  if (!stat.isDirectory()) throw Error('Unsupported asset: ' + relative);
  const result = [];
  for (const name of (await fs.readdir(full)).sort()) result.push(...await walk(root, slash(path.join(relative, name))));
  return result;
}
async function hash(file) { return createHash('sha256').update(await fs.readFile(file)).digest('hex'); }
export async function assertStopped(root) {
  let processes;
  try {
    if (process.platform === 'win32') {
      const command = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress';
      const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true });
      processes = JSON.parse(raw || '[]');
      if (!Array.isArray(processes)) processes = [processes];
    } else {
      processes = execFileSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8' }).trim().split('\n').map(line => {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
        return m && { ProcessId: +m[1], ParentProcessId: +m[2], Name: m[3], CommandLine: m[4] };
      }).filter(Boolean);
    }
  } catch { throw Error('Cannot inspect running processes; refusing data operation.'); }
  const normalized = root.replaceAll('\\', '/').toLowerCase();
  const ids = new Set();
  for (const p of processes) {
    const cmd = (p.CommandLine || '').replaceAll('\\', '/').toLowerCase();
    if (p.ProcessId === process.pid) continue;
    // workerd often has no project path in its command line. Conservatively refuse any running instance.
    if (/workerd/i.test(p.Name || '') || (/node|python|sqlite|wrangler|vite|vinext/i.test(p.Name || '') && cmd.includes(normalized)
      && !/scripts\/(backup-project-data|restore-project-data|project-data\.test)/.test(cmd))) ids.add(p.ProcessId);
  }
  let changed = true;
  while (changed) { changed = false; for (const p of processes) if (ids.has(p.ParentProcessId) && !ids.has(p.ProcessId)) { ids.add(p.ProcessId); changed = true; } }
  if (ids.size) throw Error('Stop data writers before continuing. Detected process PID(s): ' + [...ids].join(', '));
}
export async function inventory(root) {
  const paths = new Map();
  for (const [relative, kind] of [[`${state}/d1`, 'database'], [`${state}/r2`, 'r2'], ['data/english', 'english'], ['blobs', 'unclassified-assets']]) {
    for (const file of await walk(root, relative)) {
      if (kind === 'database' || kind === 'r2') {
        if (/\.sqlite-(wal|shm)$/.test(file)) continue;
      }
      paths.set(file, kind);
    }
  }
  for (const name of await fs.readdir(path.join(root, 'public')).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    if (name.startsWith('english')) for (const file of await walk(root, 'public/' + name)) paths.set(file, 'english-static');
  }
  for (const relative of ['.openai/hosting.json', 'db/schema.ts', 'db/english-schema.ts', 'db/canonical-schema.ts', 'db/paper-batch-schema.ts', 'db/lesson-plan-schema.ts', 'db/paper-solution-schema.ts', 'drizzle.config.ts', 'cloudflare-env.d.ts', 'drizzle']) {
    for (const file of await walk(root, relative)) if (/\.(ts|sql|json)$/.test(file)) paths.set(file, 'metadata');
  }
  return [...paths].sort(([a], [b]) => a.localeCompare(b)).map(([restorePath, kind]) => ({ restorePath, kind }));
}
export async function fingerprint(root) {
  const entries = await inventory(root);
  const files = entries.map(e => e.restorePath);
  // WAL content is observed for drift, but never copied as a substitute for a SQLite snapshot.
  for (const base of [`${state}/d1`, `${state}/r2`]) for (const file of await walk(root, base)) if (file.endsWith('.sqlite-wal')) files.push(file);
  const result = {};
  for (const file of files.sort()) result[file] = await hash(within(root, file));
  return result;
}
async function assertFilesUnused(root) {
  if (process.platform !== 'win32') throw Error('File occupancy guard currently supports Windows only; refusing an unverified platform.');
  const files = [];
  for (const base of [`${state}/d1`, `${state}/r2`]) for (const file of await walk(root, base)) {
    if (/\.sqlite(?:-(?:wal|shm))?$/.test(file)) files.push(within(root, file));
  }
  if (!files.length) return;
  // Probe exclusive read handles, without editing/checkpointing any SQLite content.
  const values = files.map(file => "'" + file.replaceAll("'", "''") + "'").join(',');
  const command = `$ErrorActionPreference='Stop'; foreach ($taskFile in @(${values})) { try { $taskHandle=[IO.File]::Open($taskFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); $taskHandle.Dispose() } catch { Write-Output 'A database/WAL/SHM file is occupied or inaccessible'; exit 1 } }`;
  let result;
  try { result = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw Error('Database/WAL/SHM is occupied or inaccessible; refusing data operation.'); }
  if (result.trim()) throw Error('Database file occupancy probe did not complete cleanly');
}
export function inspectDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw Error('SQLite integrity check failed: ' + file);
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeys.length) throw Error('SQLite foreign key check failed: ' + file);
    const tables = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const counts = Object.fromEntries(tables.map(t => [t.name, db.prepare('SELECT count(*) AS n FROM ' + quote(t.name)).get().n]));
    const objects = tables.some(t => t.name === '_mf_objects') ? db.prepare('SELECT key,blob_id,size FROM _mf_objects ORDER BY key').all() : [];
    return { tableCount: tables.filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_')).length,
      counts, schema: tables, objects, integrity: 'ok', foreignKeyErrors: 0 };
  } finally { db.close(); }
}
function gitState(root) {
  try { return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) }; }
  catch { return { commit: null, dirty: null }; }
}
function allowedRestore(file) {
  return /^(?:\.wrangler\/state\/v3\/(?:d1|r2)\/|data\/english\/|public\/english[^/]*(?:\/|$)|blobs\/|drizzle\/)/.test(file)
    || ['.openai/hosting.json', 'db/schema.ts', 'db/english-schema.ts', 'db/canonical-schema.ts', 'db/paper-batch-schema.ts', 'db/lesson-plan-schema.ts', 'drizzle.config.ts', 'cloudflare-env.d.ts'].includes(file);
}
export async function validateBackup(directory) {
  await noLinks(directory);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1 || manifest.status !== 'complete' || !Array.isArray(manifest.files) || !manifest.files.length) throw Error('Incomplete/unsupported backup manifest');
  const destinations = new Set();
  for (const entry of manifest.files) {
    if (!allowedRestore(entry.restorePath) || /\.sqlite-(wal|shm)$/.test(entry.restorePath)) throw Error('Disallowed restore path');
    const destination = within(directory, entry.restorePath).toLowerCase();
    if (destinations.has(destination)) throw Error('Duplicate restore destination');
    destinations.add(destination);
    const full = within(directory, entry.path);
    await noLinks(directory, entry.path);
    const stat = await fs.stat(full);
    if (!stat.isFile() || stat.size !== entry.bytes || await hash(full) !== entry.sha256) throw Error('Backup file integrity mismatch: ' + entry.path);
    if (entry.database) {
      const check = inspectDatabase(full);
      if (JSON.stringify(check) !== JSON.stringify(entry.database)) throw Error('Database manifest mismatch: ' + entry.path);
    }
  }
  const application = manifest.files.filter(f => f.kind === 'database' && f.database?.counts.questions !== undefined);
  if (application.length !== 1 || !manifest.files.some(f => f.kind === 'r2' && f.database?.objects)) throw Error('Missing D1/R2 database');
  if (!manifest.files.some(f => f.restorePath === 'data/english/manifest.json')) throw Error('Missing English manifest');
  let objectCount = 0;
  for (const entry of manifest.files.filter(f => f.kind === 'r2' && f.database)) {
    objectCount += entry.database.objects.length;
    for (const object of entry.database.objects) {
      if (!object.blob_id) continue;
      const candidates = manifest.files.filter(f => f.kind === 'r2' && f.restorePath.endsWith('/blobs/' + object.blob_id));
      if (candidates.length !== 1 || candidates[0].bytes !== object.size) throw Error('Missing/ambiguous R2 object bytes: ' + object.key);
    }
  }
  if (objectCount !== manifest.r2ObjectCount || application[0].database.tableCount !== manifest.databaseTableCount) throw Error('Manifest count mismatch');
  if (JSON.stringify(application[0].database.counts) !== JSON.stringify(manifest.keyTableCounts)) throw Error('Manifest table count mismatch');
  if (manifest.englishDataFileCount !== manifest.files.filter(f => f.kind === 'english').length) throw Error('English file count mismatch');
  return manifest;
}
export async function backupProject({ root = projectRoot, output = path.join(projectRoot, 'backups') } = {}) {
  root = path.resolve(root); output = path.resolve(output);
  await noLinks(root); await noLinks(output); await assertStopped(root); await assertFilesUnused(root);
  for (const relative of ['.wrangler/state', 'data/english', 'public', 'blobs', 'db', 'drizzle', '.openai']) {
    const sourceDirectory = path.join(root, relative);
    if (output === sourceDirectory || output.startsWith(sourceDirectory + path.sep)) throw Error('Backup output overlaps a source directory');
  }
  const inventoryBefore = await inventory(root);
  if (inventoryBefore.some(e => output === within(root, e.restorePath) || output.startsWith(within(root, e.restorePath) + path.sep))) throw Error('Backup output overlaps source assets');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join(output, timestamp + '-' + randomUUID().slice(0, 8));
  await fs.mkdir(directory, { recursive: true });
  const manifest = { formatVersion: 1, status: 'in-progress', createdAt: new Date().toISOString(), sourceRoot: root,
    databaseSource: path.join(root, state, 'd1'), git: gitState(root), exclusions: ['AI cache', 'build caches', 'node_modules', 'temporary files', '.env*', '.dev.vars*'], files: [] };
  try {
    const before = await fingerprint(root);
    manifest.sourceFingerprint = before;
    for (const entry of inventoryBefore) {
      const source = within(root, entry.restorePath);
      const relative = entry.kind + '/' + entry.restorePath;
      const target = within(directory, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      let database;
      if (entry.restorePath.endsWith('.sqlite')) {
        database = inspectDatabase(source);
        const db = new DatabaseSync(source, { readOnly: true });
        try { await sqliteBackup(db, target); } finally { db.close(); }
        if (JSON.stringify(inspectDatabase(target)) !== JSON.stringify(database)) throw Error('SQLite snapshot differs from source');
      } else await fs.copyFile(source, target);
      manifest.files.push({ ...entry, path: relative, bytes: (await fs.stat(target)).size, sha256: await hash(target), ...(database ? { database } : {}) });
    }
    await assertStopped(root); await assertFilesUnused(root);
    if (JSON.stringify(before) !== JSON.stringify(await fingerprint(root))) throw Error('Source data changed during backup; backup is not a consistent offline baseline');
    const application = manifest.files.filter(f => f.kind === 'database' && f.database?.counts.questions !== undefined);
    if (application.length !== 1) throw Error('Expected one application D1 database');
    manifest.databaseFiles = manifest.files.filter(f => f.kind === 'database' && f.database).map(f => f.path);
    manifest.databaseTableCount = application[0].database.tableCount;
    manifest.keyTableCounts = application[0].database.counts;
    manifest.r2ObjectCount = manifest.files.filter(f => f.kind === 'r2' && f.database).reduce((sum, f) => sum + f.database.objects.length, 0);
    manifest.englishDataFileCount = manifest.files.filter(f => f.kind === 'english').length;
    manifest.englishStaticFileCount = manifest.files.filter(f => f.kind === 'english-static').length;
    manifest.migrations = { journal: 'metadata/drizzle/meta/_journal.json', sqlFiles: manifest.files.filter(f => /^drizzle\/[^/]+\.sql$/.test(f.restorePath)).map(f => ({ file: f.restorePath, sha256: f.sha256 })),
      journalEntries: await fs.readFile(path.join(directory, 'metadata/drizzle/meta/_journal.json'), 'utf8').then(value => JSON.parse(value).entries),
      applied: 'Not inferred from migration filenames; actual SQLite schema/counts recorded in database entries.' };
    manifest.status = 'complete';
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await validateBackup(directory);
    return { directory, manifest };
  } catch (error) {
    manifest.status = 'failed'; manifest.error = error.message;
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    throw Error('Backup FAILED at ' + directory + ': ' + error.message);
  }
}
export async function restoreProject({ directory, target = projectRoot, force = false, verifyOnly = false }) {
  if (!directory) throw Error('Explicit --backup=<directory> is required');
  directory = path.resolve(directory); target = path.resolve(target);
  const manifest = await validateBackup(directory);
  if (verifyOnly) return { verified: true, manifest };
  await noLinks(target); await assertStopped(target); await assertFilesUnused(target);
  if (target === path.parse(target).root || directory === target || target.startsWith(directory + path.sep)) throw Error('Unsafe restore target');
  // A project-local backups directory is supported, but cannot be inside a tree replaced by restore.
  for (const relative of ['.wrangler/state', 'data/english', 'public', 'blobs', 'db', 'drizzle', '.openai']) {
    const managed = path.join(target, relative);
    if (directory === managed || directory.startsWith(managed + path.sep)) throw Error('Backup is inside an overwritten data tree');
  }
  const destinations = manifest.files.map(f => f.restorePath);
  for (const f of destinations) await noLinks(target, f);
  const current = await inventory(target);
  const originalFingerprint = await fingerprint(target);
  const collisions = [];
  for (const f of destinations) if (await exists(within(target, f))) collisions.push(f);
  if ((current.length || collisions.length) && !force) throw Error('Target already contains data/metadata; refusing overwrite. Use a new --target or explicit --force.');
  let safetyBackup;
  if (current.length || collisions.length) {
    // Cannot force over a partial state unless it can first produce a complete validated backup.
    safetyBackup = (await backupProject({ root: target, output: path.join(target, 'backups') })).directory;
  }
  const staging = path.join(target, '.data-restore-' + randomUUID());
  await fs.mkdir(staging, { recursive: true });
  let applying = false;
  try {
    for (const entry of manifest.files) {
      const dest = within(staging, entry.restorePath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(within(directory, entry.path), dest);
      if (await hash(dest) !== entry.sha256) throw Error('Staged restore integrity mismatch');
    }
    await assertStopped(target); await assertFilesUnused(target);
    if (JSON.stringify(originalFingerprint) !== JSON.stringify(await fingerprint(target))) throw Error('Target changed while preparing restore');
    applying = true;
    // Replace data trees as units, preserving their prior contents for rollback. Never delete recursively.
    const trees = ['.wrangler/state/v3/d1', '.wrangler/state/v3/r2', 'data/english', 'blobs'];
    const publicTrees = [...new Set(destinations.filter(f => f.startsWith('public/english')).map(f => f.split('/').slice(0, 2).join('/')))];
    const handled = [...trees, ...publicTrees].filter(tree => destinations.some(f => f === tree || f.startsWith(tree + '/')));
    const loose = destinations.filter(f => !handled.some(tree => f === tree || f.startsWith(tree + '/')));
    const rollback = path.join(target, 'backups', 'pre-restore-files-' + randomUUID());
    const moved = [];
    try {
      for (const relative of [...handled, ...loose]) {
        const dest = within(target, relative), staged = within(staging, relative), old = within(rollback, relative);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        if (await exists(dest)) { await fs.mkdir(path.dirname(old), { recursive: true }); await fs.rename(dest, old); }
        moved.push({ dest, old, hadOld: await exists(old), installed: false });
        await fs.rename(staged, dest); moved.at(-1).installed = true;
      }
      for (const entry of manifest.files) if (await hash(within(target, entry.restorePath)) !== entry.sha256) throw Error('Restored file mismatch');
    } catch (error) {
      // Retain failed new files under staging, then put old paths back.
      for (const item of moved.reverse()) {
        if (item.installed) { const failed = path.join(staging, 'failed-' + randomUUID()); await fs.rename(item.dest, failed); }
        if (item.hadOld) await fs.rename(item.old, item.dest);
      }
      throw error;
    }
    return { target, safetyBackup, rollbackFiles: rollback, staging, files: manifest.files.length };
  } catch (error) { throw Error('Restore failed; retained staging at ' + staging + (applying ? '; rollback attempted' : '; target data not applied') + ': ' + error.message); }
}
export function argumentsFor(argv, allowed) {
  const result = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!match || !allowed.includes(match[1]) || match[1] in result) throw Error('Invalid/duplicate argument: ' + arg);
    result[match[1]] = match[2] === undefined ? true : match[2];
  }
  return result;
}

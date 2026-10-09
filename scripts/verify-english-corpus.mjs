import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const manifest = JSON.parse(await readFile('data/english/manifest.json', 'utf8'));
assert.equal(manifest.papers.length, 12);
assert.equal(manifest.failures.length, 0);
for (const p of manifest.papers) {
  assert.ok(p.artifacts.some(a => a.kind === 'paper'));
  for (const a of p.artifacts) {
    const bytes = await readFile(a.rawPath);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), a.sha256);
    if (a.publicPath) assert.deepEqual(await readFile(`public${a.publicPath}`), bytes);
    if (a.kind === 'html_snapshot') {
      const html = bytes.toString('utf8');
      const count = Number(html.match(/_PAGE_COUNT\s*=\s*"(\d+)"/)?.[1] || 1);
      const base = a.sourceUrl.replace(/_\d{1,2}\.shtml$/, '.shtml');
      for (let n=1; n<count; n++) assert.ok(p.artifacts.some(b => b.sourceUrl === base.replace('.shtml', `_${n}.shtml`)), `${p.id} missing page ${n}`);
    }
  }
}
const db = new DatabaseSync(':memory:');
db.exec(await readFile('drizzle/0014_reflective_cable.sql', 'utf8'));
const seed = await readFile('../outputs/english-exams/import.sql', 'utf8');
db.exec(seed); db.exec(seed);
assert.equal(db.prepare('SELECT COUNT(*) n FROM english_papers').get().n, 12);
assert.equal(db.prepare('SELECT COUNT(*) n FROM english_questions').get().n, 75);
assert.equal(db.prepare('SELECT COUNT(*) n FROM english_options').get().n, 300);
assert.equal(db.prepare("SELECT COUNT(*) n FROM english_sections WHERE type='listening'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) n FROM english_answers WHERE status!='PENDING' OR answer IS NOT NULL").get().n, 0);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM english_questions q WHERE (SELECT COUNT(*) FROM english_options o WHERE o.question_id=q.id)!=4').get().n, 0);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
console.log(`PASS: 12 papers, ${manifest.papers.reduce((n,p)=>n+p.artifacts.length,0)} hashed artifacts, full pagination, public copies, 75 reading questions, 300 options, no listening, no unverified Gold answers, repeat import and foreign keys.`);
db.close();
if (process.argv.includes('--live')) {
  const base = 'http://127.0.0.1:5173';
  const list = await fetch(`${base}/api/english/papers`).then(r => { assert.equal(r.status,200); return r.json(); });
  assert.equal(list.papers.length,12);
  for (const p of list.papers) {
    const data = await fetch(`${base}/api/english/papers/${p.id}`).then(r=>{ assert.equal(r.status,200); return r.json(); });
    assert.equal(data.sections.length,p.section_count);
    assert.equal(data.questions.length,20);
    assert.equal(data.options.length,95);
    const a = data.artifacts.find(a=>a.public_path);
    const response = await fetch(base+a.public_path);
    assert.equal(response.status,200);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),a.sha256);
  }
  assert.equal((await fetch(`${base}/api/english/papers/not-a-paper`)).status,404);
  assert.equal((await fetch(`${base}/english`)).status,200);
  console.log('PASS: live page, all 12 paper APIs, question/option alignment, downloadable original hashes, missing-paper 404.');
}

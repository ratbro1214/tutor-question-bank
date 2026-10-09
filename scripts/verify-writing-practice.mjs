import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const data = JSON.parse(await readFile('data/english/writing-practice.json', 'utf8'));
const manifest = JSON.parse(await readFile('data/english/manifest.json', 'utf8'));
assert.equal(data.length, 12);
assert.equal(new Set(data.map(p => p.paperId)).size, 12);
assert.deepEqual(data, JSON.parse(await readFile('../outputs/english-exams/writing/writing-practice.json', 'utf8')));
for (const p of data) {
  assert.equal(p.tasks.length, 2);
  const [a,c] = p.tasks;
  assert.equal(a.type, 'APPLICATION'); assert.equal(a.score, 15); assert.equal(a.wordCount, 80);
  assert.ok(a.text.length > 100); assert.match(a.text, /80\s*(?:个)?\s*左右|80\s*(?:个)?\s*词|80\s*个左右/);
  assert.equal(c.type, 'CONTINUATION'); assert.equal(c.score, 25); assert.equal(c.wordCount, 150);
  assert.ok(c.material.length > 1200); assert.match(c.requirements, /150/);
  assert.equal(c.openingLines.length, 2); assert.ok(c.openingLines.every(line => line.length > 25 && /[.!]$/.test(line)));
  for (const t of [a.text, c.material, c.requirements, ...c.openingLines]) {
    assert.doesNotMatch(t, /<!--|```|<table|【答案】|参考答案|One possible version|英语听力|海量高清|seal|\\because/);
  }
  for (const line of c.openingLines) assert.ok(!c.material.includes(line), `Starter duplicated in material ${p.paperId}`);
  assert.ok(p.sources.length > 0);
  for (const s of p.sources) {
    const artifact = manifest.papers.find(m => m.id === p.paperId).artifacts.find(a => a.id === s.artifactId);
    assert.ok(artifact); assert.equal(artifact.kind, 'paper'); assert.equal(s.sha256, artifact.sha256);
    assert.ok(s.publicPath.startsWith(`/english-exams/${p.paperId}/`));
    assert.equal(createHash('sha256').update(await readFile(`public${s.publicPath}`)).digest('hex'), s.sha256);
  }
}
assert.match(data.find(p => p.paperId === 'gaokao_en_2025_II').tasks[0].text, /校英文报编辑/);
assert.match(data.find(p => p.paperId === 'gaokao_en_2023_II').tasks[0].text, /随机分为两人一组/);
assert.match(data.find(p => p.paperId === 'gaokao_en_2025_I').tasks[0].text, /Yours/);
console.log('PASS: 12 papers, 24 writing tasks, full requirements and 24 continuation starters; local original hashes, no answer sections or OCR markup mixed in.');
if (process.argv.includes('--live')) {
  const base='http://localhost:5173';
  const listing=await fetch(`${base}/api/english/writing`).then(r => r.json());
  assert.equal(listing.papers.length,12);
  for (const p of data) {
    const r=await fetch(`${base}/api/english/writing/${p.paperId}`); assert.equal(r.status,200);
    const detail=await r.json(); assert.deepEqual(detail,p);
  }
  assert.equal((await fetch(`${base}/api/english/writing/missing`)).status,404);
  console.log('PASS: all 12 live writing endpoints, catalog and unknown-paper 404.');
}

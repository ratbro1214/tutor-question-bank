import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
const data = JSON.parse(await readFile('data/english/language-practice.json', 'utf8'));
assert.equal(data.length, 12);
assert.equal(new Set(data.map(p => p.paperId)).size, 12);
for (const p of data) {
  assert.deepEqual(p.passages.map(t => t.questions.length), [15, 10]);
  assert.equal(p.evidence.length, 25);
  for (const t of p.passages) {
    const markers = [...t.text.matchAll(/\[\[(\d+)\]\]/g)].map(m => Number(m[1]));
    assert.deepEqual(markers, t.questions.map(q => q.number));
    assert.ok(t.text.length > 100);
    for (const q of t.questions) {
      assert.equal(q.answerStatus, 'SOURCE_ALIGNED');
      assert.ok(q.acceptedAnswers.length > 0);
      const e = p.evidence.find(e => e.id === q.answerEvidenceId);
      assert.equal(e.questionId, q.id); assert.equal(e.questionNumber, q.number); assert.equal(e.normalizedAnswer, q.answer);
      if (q.type === 'CLOZE') {
        assert.equal(q.options.map(o => o.label).join(''), 'ABCD');
        assert.ok(q.options.every(o => o.text.trim()));
        assert.ok(q.options.some(o => o.label === q.answer));
      } else {
        assert.equal(q.options.length, 0);
        assert.ok(q.givenWord === null || /^[a-z]+$/i.test(q.givenWord));
      }
    }
  }
}
const db = new DatabaseSync(':memory:');
db.exec(await readFile('drizzle/0014_reflective_cable.sql', 'utf8'));
db.exec(await readFile('../outputs/english-exams/import.sql', 'utf8'));
db.exec(await readFile('../outputs/english-exams/reading/import-reading.sql', 'utf8'));
const sql = await readFile('../outputs/english-exams/language/import-language.sql', 'utf8');
db.exec(sql); db.exec(sql);
assert.equal(db.prepare('SELECT COUNT(*) n FROM english_questions').get().n, 540);
assert.equal(db.prepare("SELECT COUNT(*) n FROM english_questions WHERE type='CLOZE'").get().n, 180);
assert.equal(db.prepare("SELECT COUNT(*) n FROM english_questions WHERE type='GRAMMAR_FILL'").get().n, 120);
assert.equal(db.prepare('SELECT COUNT(*) n FROM english_options').get().n, 1860);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
const question = data[0].passages[0].questions[0];
db.prepare("UPDATE english_answers SET status='VERIFIED',answer='Z' WHERE question_id=?").run(question.id);
db.exec(sql);
assert.equal(db.prepare('SELECT answer FROM english_answers WHERE question_id=?').get(question.id).answer, 'Z');
db.close();
console.log('PASS: 12 papers, 24 passages, 300 blanks, 720 cloze options; idempotent import, protected verified answers, valid foreign keys.');
if (process.argv.includes('--live')) {
  const base = 'http://localhost:5173';
  const list = await fetch(`${base}/api/english/language`).then(r => r.json());
  assert.equal(list.papers.length, 12);
  for (const p of data) {
    const response = await fetch(`${base}/api/english/language/${p.paperId}`);
    assert.equal(response.status, 200);
    const d = await response.json();
    assert.equal(d.passages.length, 2); assert.equal(d.questions.length, 25); assert.equal(d.options.length, 60);
    for (const q of d.questions) assert.equal(q.answer, p.passages.flatMap(t => t.questions).find(original => original.id === q.id).answer);
    for (const t of d.passages) assert.equal(JSON.parse(t.metadata).questions.length, t.label === '完形填空' ? 15 : 10);
  }
  assert.equal((await fetch(`${base}/api/english/language/not-a-paper`)).status, 404);
  console.log('PASS: all 12 live language APIs and unknown-paper handling.');
}

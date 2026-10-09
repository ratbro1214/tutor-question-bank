import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const data=JSON.parse(await readFile('data/english/reading-practice.json','utf8'));
assert.equal(data.length,12);
for(const p of data){
 assert.deepEqual(p.passages.map(t=>t.label),['A','B','C','D','七选五']);
 assert.deepEqual(p.passages.map(t=>t.questions.length),[3,4,4,4,5]);
 assert.equal(p.evidence.length,20);
 for(const t of p.passages){assert.ok(t.text.length>100);
  if(t.label==='七选五')for(const q of t.questions)assert.match(t.text,new RegExp(`\\b${q.number}\\b`));
  for(const f of t.figures??[]){const bytes=await readFile(`public${f.path}`);assert.deepEqual(bytes,await readFile(`../outputs/english-exams/reading/${f.path.split('/').pop()}`));}
  for(const q of t.questions){
  assert.equal(q.options.map(o=>o.label).join(''),q.type==='MCQ'?'ABCD':'ABCDEFG');
  assert.ok(q.options.every(o=>o.text.length>0));assert.ok(q.options.some(o=>o.label===q.answer));
  assert.equal(q.answerStatus,'SOURCE_ALIGNED');const e=p.evidence.find(e=>e.id===q.answerEvidenceId);
  assert.equal(e.questionId,q.id);assert.equal(e.questionNumber,q.number);assert.equal(e.normalizedAnswer,q.answer);
 }}
}
const db=new DatabaseSync(':memory:');db.exec(await readFile('drizzle/0014_reflective_cable.sql','utf8'));
db.exec(await readFile('../outputs/english-exams/import.sql','utf8'));
const sql=await readFile('../outputs/english-exams/reading/import-reading.sql','utf8');db.exec(sql);db.exec(sql);
assert.equal(db.prepare('SELECT COUNT(*) n FROM english_questions').get().n,240);
assert.equal(db.prepare('SELECT COUNT(*) n FROM english_options').get().n,1140);
assert.equal(db.prepare("SELECT COUNT(*) n FROM english_answers WHERE status='SOURCE_ALIGNED' AND verified_at IS NULL AND answer IS NOT NULL").get().n,240);
assert.equal(db.prepare("SELECT COUNT(*) n FROM english_answers WHERE status='VERIFIED'").get().n,0);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
console.log('PASS: 12 papers, 60 passages, 240 numbered questions and aligned source answers, 1140 options, idempotent import, foreign keys. No answer-correctness validation.');
if(process.argv.includes('--live')){
 const base='http://127.0.0.1:5173';
 const list=await fetch(`${base}/api/english/reading`).then(r=>r.json());assert.equal(list.papers.length,12);
 for(const p of data){const d=await fetch(`${base}/api/english/reading/${p.paperId}`).then(r=>r.json());assert.equal(d.passages.length,5);assert.equal(d.questions.length,20);assert.equal(d.options.length,95);for(const q of d.questions){assert.equal(q.answer,p.passages.flatMap(t=>t.questions).find(t=>t.id===q.id).answer);assert.equal(q.answer_status,'SOURCE_ALIGNED');}}
 assert.equal((await fetch(`${base}/api/english/reading/not-a-paper`)).status,404);
 const figureResponse=await fetch(`${base}/english-exams/2025-I-A-figure.png`);assert.equal(figureResponse.status,200);assert.equal(createHash('sha256').update(Buffer.from(await figureResponse.arrayBuffer())).digest('hex'),createHash('sha256').update(await readFile('public/english-exams/2025-I-A-figure.png')).digest('hex'));
 console.log('PASS: all 12 live reading APIs return the imported question and source-answer mapping.');
}

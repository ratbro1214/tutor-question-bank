import { readFile, writeFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
const data = JSON.parse(await readFile('data/english/language-practice.json', 'utf8'));
const manifest = JSON.parse(await readFile('data/english/manifest.json', 'utf8'));
if (data.length !== 12 || data.some(p => p.passages.length !== 2 || p.evidence.length !== 25)) throw Error('Expected 12 complete language papers');
const sql = ['PRAGMA foreign_keys=ON;'];
const quote = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
function upsert(table, values, keys, condition = '') {
  const cols = Object.keys(values);
  sql.push(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${Object.values(values).map(quote).join(',')}) ON CONFLICT(${keys.join(',')}) DO UPDATE SET ${cols.filter(c => !keys.includes(c)).map(c => `${c}=excluded.${c}`).join(',')} ${condition};`);
}
for (const p of data) {
  const section = `${p.paperId}_language`, source = manifest.papers.find(m => m.id === p.paperId);
  upsert('english_sections', { id: section, paper_id: p.paperId, type: 'language', title: '完形填空与语法填空', position: 1 }, ['id']);
  for (const t of p.passages) {
    upsert('english_passages', { id: t.id, section_id: section, label: t.label, text: t.text, artifact_id: t.artifactId, source_locator: JSON.stringify(t.sourceLocators), status: 'EXTRACTED' }, ['id']);
    const payload = { questions: t.questions.map(q => ({ id: q.id, givenWord: q.givenWord ?? null, acceptedAnswers: q.acceptedAnswers })), numberRepairs: t.numberRepairs, extractionCorrections: p.extractionCorrections, answerCorrections: p.answerCorrections };
    upsert('english_annotations', { id: `${t.id}_metadata`, passage_id: t.id, input_sha256: source.artifacts.find(a => a.id === t.artifactId).sha256, pipeline: 'language-practice', version: '1', payload: JSON.stringify(payload), generated_at: new Date().toISOString() }, ['id']);
    for (const q of t.questions) {
      if (!q.answer || !q.acceptedAnswers?.length) throw Error(`Missing answer ${q.id}`);
      upsert('english_questions', { id: q.id, section_id: section, passage_id: t.id, number: q.number, type: q.type, stem: q.stem, score: q.type === 'CLOZE' ? '1' : '1.5' }, ['id']);
      for (const o of q.options) upsert('english_options', { question_id: q.id, label: o.label, text: o.text }, ['question_id', 'label']);
      const e = p.evidence.find(e => e.id === q.answerEvidenceId);
      upsert('english_answer_evidence', { id: e.id, question_id: q.id, artifact_id: e.artifactId, independence_group: new URL(e.sourceUrl).hostname, raw_answer: JSON.stringify({ sourceNumber: e.sourceNumber, questionNumber: e.questionNumber, rawAnswer: e.rawAnswer, normalizationReason: e.normalizationReason }), normalized_answer: e.normalizedAnswer, method: e.method }, ['id']);
      upsert('english_answers', { question_id: q.id, answer: q.answer, status: 'SOURCE_ALIGNED', evidence_ids: JSON.stringify([e.id]), verified_at: null }, ['question_id'], "WHERE english_answers.status!='VERIFIED'");
    }
  }
}
const file = '../outputs/english-exams/language/import-language.sql';
await writeFile(file, sql.join('\n'));
if (process.argv.includes('--apply')) {
  const dir = path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const files = (await readdir(dir)).filter(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (files.length !== 1) throw Error('Expected one application database');
  const db = new DatabaseSync(path.join(dir, files[0]));
  db.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON;');
  const students = db.prepare('SELECT COUNT(*) n FROM students').get().n;
  try { db.exec('BEGIN IMMEDIATE;'); db.exec(sql.join('\n')); db.exec('COMMIT;'); }
  catch (error) { db.exec('ROLLBACK;'); throw error; }
  if (db.prepare('SELECT COUNT(*) n FROM students').get().n !== students) throw Error('Student count changed');
  console.log('Imported 12 language papers, 300 questions. Existing students:', students);
  db.close();
} else console.log('Generated:', file);

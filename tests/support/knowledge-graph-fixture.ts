import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { KnowledgeGraphStore } from '../../lib/knowledge-graph-store';
import { matchQuestionRow } from '../../lib/paper-solution-store';
export function graphFixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../../drizzle/' + file, import.meta.url), 'utf8'));
  let race: (() => void) | null = null, fail = false;
  const binding = { prepare(sql: string) { let values: unknown[] = []; const s = { bind(...v: unknown[]) { values = v; return s; }, async first() { return db.prepare(sql).get(...values as []) || null; }, async all() { return { results: db.prepare(sql).all(...values as []) }; }, run() { return { meta: { changes: db.prepare(sql).run(...values as []).changes } }; } }; return s; },
    async batch(statements: { run(): unknown }[]) { if (race) { const f = race; race = null; f(); } db.exec('BEGIN'); try { const r = statements.map((s, i) => { const result = s.run(); if (fail && i === 1) throw Error('injected write failure'); return result; }); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } } as unknown as D1Database;
  db.exec("INSERT INTO question_library_scopes(id,code,name,scope_type,kind,owner_principal_id,ownership_status) VALUES('s','s','TEST A','teacher_private','private','teacher','known'),('other','other','TEST B','teacher_private','private','other','known')");
  for (const [code, name] of [['HS-DERIVATIVE-CALC', '求导'], ['HS-DERIVATIVE-MONOTONICITY', '单调性'], ['HS-DERIVATIVE-PARAMETER', '参数']]) db.prepare("INSERT INTO knowledge_points(code,name,chapter_code) VALUES(?,?,'HS-DERIVATIVE')").run(code, name);
  function question(scope = 's', n = 0) { const c = randomUUID(), r = randomUUID();
    db.prepare("INSERT INTO canonical_questions(id,scope_id,subject,status) VALUES(?,?,'math','active')").run(c, scope);
    db.prepare("INSERT INTO canonical_question_revisions(id,canonical_question_id,revision,subject,education_stage,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,identity_status,change_reason) VALUES(?,?,1,'math','高中',?,'x',?,'v1','v1',?,'ready','test')").run(r, c, 'TEST ONLY: f(x)=x^2 ' + n, String(n), JSON.stringify({ classification: { knowledge_points: [{ code: 'HS-DERIVATIVE-MONOTONICITY', name: '单调性' }] } }));
    db.prepare('UPDATE canonical_questions SET current_revision_id=? WHERE id=?').run(r, c); return { c, r };
  }
  const a = question(), b = question('other');
  function solution(c = a.c, r = a.r) {
    const paper = randomUUID(), qid = randomUUID(), doc = randomUUID(), occurrence = randomUUID(), batch = randomUUID(), source = randomUUID(), entry = randomUUID(), review = randomUUID();
    const text = String(db.prepare('SELECT original_text FROM canonical_question_revisions WHERE id=?').get(r)!.original_text);
    db.prepare("INSERT INTO papers VALUES(?,'TEST','test.pdf','test/source','application/pdf',?,'now')").run(paper, paper);
    db.prepare("INSERT INTO paper_questions(id,paper_id,question_number,regions,image_key,question_text,updated_at) VALUES(?,?,1,'[]','test.png',?,'now')").run(qid, paper, text);
    db.prepare("INSERT INTO source_documents(id,scope_id,source_type,title,math_paper_id) VALUES(?,'s','math_paper','TEST',?)").run(doc, paper);
    db.prepare("INSERT INTO question_occurrences(id,canonical_question_id,content_revision_id,source_document_id,source_type,occurrence_key,image_key,raw_text,mapping_status) VALUES(?,?,?,?,'math_paper',?,'test.png',?,'confirmed')").run(occurrence, c, r, doc, qid, text);
    db.prepare("INSERT INTO question_module_links(id,module_type,module_record_id,canonical_question_id,occurrence_id,legacy_paper_question_id,observed_source_hash) VALUES(?,'paper_question',?,?,?,?,'test')").run(randomUUID(), qid, c, occurrence, qid);
    db.prepare("INSERT INTO paper_import_batches(id,scope_id,status,created_at) VALUES(?,'s','completed','now')").run(batch);
    db.prepare("INSERT INTO paper_solution_sources(id,paper_id,batch_id,scope_id,owner_id,filename,storage_key,file_hash,version,created_at) VALUES(?,?,?,'s','teacher','TEST.pdf','test',?,'v1','now')").run(source, paper, batch, source);
    db.prepare("INSERT INTO paper_solution_entries(id,source_id,entry_key,data) VALUES(?,?,'test',?)").run(entry, source, JSON.stringify({ text: 'TEST ONLY 解：求导判号', answerOnly: false, regions: [] }));
    const q = db.prepare('SELECT * FROM paper_questions WHERE id=?').get(qid)!;
    db.prepare("INSERT INTO paper_solution_matches(entry_id,question_id,status,proposal,revision,question_snapshot,reviewer,updated_at) VALUES(?,?,'CONFIRMED','{}',1,?,'teacher','now')").run(entry, qid, JSON.stringify(matchQuestionRow(q as never)));
    const result = { quality: { verdict: 'no_obvious_error', summary: 'TEST 已核查', issues: [], originalIdea: '求导判号', strengths: [], limitations: ['须在可导区间内，不能跨越定义域断点'] }, methods: { alternatives: [], recommendation: 'keep_original', reason: 'TEST', method: { model: '符号表法', features: ['单调区间'], steps: ['求导', '分析符号'], conditions: ['区间内可导'], mistakes: ['忽略定义域'], variants: [] } } };
    db.prepare("INSERT INTO paper_solution_reviews(id,entry_id,match_revision,operation_id,mode,status,input,result,teacher_status,model,prompt_version,created_at,updated_at) VALUES(?,?,1,?,'deep','completed','{}',?,'accepted','mock','5B-test','now','now')").run(review, entry, randomUUID(), JSON.stringify(result));
    return { paper, qid, source, entry, review, result };
  }
  return { db, binding, a, b, question, solution, store: new KnowledgeGraphStore(binding, 'teacher', ['s']), other: new KnowledgeGraphStore(binding, 'other', ['other']), sameScopeOther: new KnowledgeGraphStore(binding, 'stranger', ['s']), race(f: () => void) { race = f; }, fail(v: boolean) { fail = v; } };
}

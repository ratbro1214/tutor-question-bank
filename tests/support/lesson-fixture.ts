import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { LessonStore } from '../../lib/lesson-plan-store';
export function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../../drizzle/' + file, import.meta.url), 'utf8'));
  let fail = false, race: (() => void) | null = null;
  const binding = { prepare(sql: string) {
    let values: (string | number)[] = [];
    const statement = { bind(...v: (string | number)[]) { values = v; return statement; },
      async first() { return db.prepare(sql).get(...values) || null; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
      run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; } };
    return statement;
  }, async batch(statements: { run(): unknown }[]) {
    if (race) { const callback = race; race = null; callback(); }
    db.exec('BEGIN'); try { const results = statements.map((s, i) => { const r = s.run(); if (fail && i === 1) throw Error('injected database failure'); return r; }); db.exec('COMMIT'); return results; } catch (e) { db.exec('ROLLBACK'); throw e; }
  } } as unknown as D1Database;
  const c = randomUUID(), r = randomUUID(), c2 = randomUUID(), r2 = randomUUID();
  db.exec(`INSERT INTO question_library_scopes(id,code,name,scope_type,kind) VALUES ('s','s','TEST ONLY','legacy_private','private'),('other','other','TEST ONLY','legacy_private','private')`);
  for (const [id, rev, scope] of [[c, r, 's'], [c2, r2, 'other']]) {
    db.prepare(`INSERT INTO canonical_questions(id,scope_id,subject,status) VALUES (?,?,'math','active')`).run(id, scope);
    db.prepare(`INSERT INTO canonical_question_revisions(id,canonical_question_id,revision,subject,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,change_reason) VALUES (?,?,1,'math','TEST ONLY: f(x)=x^2','x','h','v1','v1','{}','test')`).run(rev, id);
    db.prepare('UPDATE canonical_questions SET current_revision_id=? WHERE id=?').run(rev, id);
  }
  return { db, store: new LessonStore(binding, 'teacher', ['s']), stranger: new LessonStore(binding, 'stranger', ['other']), c, r, c2, r2,
    fail(value: boolean) { fail = value; }, race(callback: () => void) { race = callback; } };
}

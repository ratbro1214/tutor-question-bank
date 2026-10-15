import type { DatabaseSync } from 'node:sqlite';
/** Offline adapter only, sharing the actual D1 SQL and transactional batch path. */
export function sqliteD1(db: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...v: unknown[]) { values = v; return statement; },
        async first() { return db.prepare(sql).get(...values as []) || null; },
        async all() { return { results: db.prepare(sql).all(...values as []) }; },
        run() { return { meta: { changes: db.prepare(sql).run(...values as []).changes } }; },
      }; return statement;
    },
    async batch(statements: { run(): unknown }[]) {
      db.exec('BEGIN IMMEDIATE');
      try { const result=statements.map(s=>s.run());db.exec('COMMIT');return result; }
      catch(e) { db.exec('ROLLBACK');throw e; }
    },
  } as unknown as D1Database;
}

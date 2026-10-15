export class LibraryTrashError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export class LibraryTrashStore {
  constructor(private db: D1Database, private owner: string, private scopes: string[]) {
    if (!owner || !scopes.length) throw new LibraryTrashError('无权修改此题库。', 403);
  }
  async change(id: string, restore = false) {
    const placeholders = this.scopes.map(() => '?').join(',');
    const accessible = `SELECT id FROM canonical_questions WHERE id=? AND subject='math' AND status IN ('active','provisional') AND scope_id IN (${placeholders})`;
    const row = await this.db.prepare(accessible).bind(id, ...this.scopes).first();
    if (!row) throw new LibraryTrashError('题目不存在或无权访问。', 404);
    // Repeat authorization inside the write. Sources, revisions, files, student
    // records and pinned lesson references remain intact for later restoration.
    if (restore) {
      await this.db.prepare(`DELETE FROM math_library_trash WHERE canonical_question_id IN (${accessible})`).bind(id, ...this.scopes).run();
    } else {
      await this.db.prepare(`INSERT OR IGNORE INTO math_library_trash(canonical_question_id,deleted_by) SELECT id,? FROM canonical_questions WHERE id=? AND subject='math' AND status IN ('active','provisional') AND scope_id IN (${placeholders})`).bind(this.owner, id, ...this.scopes).run();
    }
    return { ok: true };
  }
}

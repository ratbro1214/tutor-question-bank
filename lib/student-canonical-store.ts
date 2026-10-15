import { createHash } from 'node:crypto';
import { normalizeClassificationTags, validateClassification, type Classification } from './classification';
import { normalizeQuestionTextV1 } from './paper-canonical-preview.mjs';
import { tryAttachKnowledge } from './knowledge_graph/attachment-store';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
// Stable UUIDs make concurrent submissions converge without adding a new schema.
const uuid = (value: string) => { const h = hash(value); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
export class StudentImportError extends Error { constructor(message: string, public status = 409) { super(message); } }
type Row = { id: number; student_id: number; image_key: string; original_filename: string; image_mime_type: string; extracted_question: string; teacher_confirmed_classification: string; confirmed_at: string; deleted_at: string | null };
export type StudentPreview = { snapshot: string; text: string; classification: Classification; imageUrl: string; canonicalId: string | null };

export class StudentCanonicalStore {
  constructor(private db: D1Database, private bucket: R2Bucket, private scope: string, private owner: string) {}
  private async row(id: number, studentId: number) {
    const row = await this.db.prepare('SELECT q.* FROM questions q JOIN students s ON s.id=q.student_id WHERE q.id=? AND q.student_id=? AND q.deleted_at IS NULL AND s.deleted_at IS NULL').bind(id, studentId).first<Row>();
    if (!row) throw new StudentImportError('题目不存在或已移入回收站。', 404);
    return row;
  }
  private snapshot(row: Row) { return hash(JSON.stringify(row)); }
  private async link(id: number) {
    return this.db.prepare("SELECT l.canonical_question_id AS id,l.observed_source_hash AS snapshot,c.scope_id FROM question_module_links l JOIN canonical_questions c ON c.id=l.canonical_question_id WHERE l.module_type='student_question' AND l.module_record_id=?").bind(String(id)).first<{ id: string; snapshot: string; scope_id: string }>();
  }
  async preview(id: number, studentId: number): Promise<StudentPreview> {
    const row = await this.row(id, studentId), link = await this.link(id);
    if (link && link.scope_id !== this.scope) throw new StudentImportError('已有题目关联属于其他私有题库。', 403);
    const classification = normalizeClassificationTags(JSON.parse(row.teacher_confirmed_classification));
    return { snapshot: this.snapshot(row), text: row.extracted_question || classification.extracted_question || '', classification, imageUrl: `/api/images/${encodeURIComponent(row.image_key)}`, canonicalId: link?.id || null };
  }
  async add(id: number, studentId: number, snapshot: string, text: string) {
    const row = await this.row(id, studentId);
    if (snapshot !== this.snapshot(row)) throw new StudentImportError('题目已修改，请关闭核对窗口后重新打开。');
    text = text.trim();
    if (!text || text.length > 20000) throw new StudentImportError('请填写完整题干，最多 20000 字。', 400);
    const classification = normalizeClassificationTags(JSON.parse(row.teacher_confirmed_classification));
    if (validateClassification(classification).length || !classification.knowledge_points.length) throw new StudentImportError('请先保存有效的学段、章节及知识点分类。', 400);
    const image = await this.bucket.get(row.image_key);
    if (!image) throw new StudentImportError('原始题图缺失，无法加入统一题库。', 400);
    const imageHash = hash(new Uint8Array(await image.arrayBuffer())), normalized = normalizeQuestionTextV1(text);
    const old = await this.link(id);
    if (old) {
      if (old.scope_id !== this.scope) throw new StudentImportError('无权修改已有题库关联。', 403);
      const pinned = await this.db.prepare('SELECT r.original_text,o.occurrence_hash FROM question_module_links l JOIN question_occurrences o ON o.id=l.occurrence_id JOIN canonical_question_revisions r ON r.id=o.content_revision_id WHERE l.module_type=\'student_question\' AND l.module_record_id=?').bind(String(id)).first<{ original_text: string; occurrence_hash: string }>();
      if (old.snapshot !== snapshot || pinned?.original_text !== text || pinned.occurrence_hash !== imageHash) throw new StudentImportError('此题已加入统一题库，当前内容与入库版本不同；原入库版本已保留。');
      return { canonicalId: old.id, reused: true, knowledgeGraph: await tryAttachKnowledge(this.db, this.owner, [this.scope], old.id) };
    }
    // Only identical reviewed text AND image bytes in the same scope can reuse an identity.
    const matches = await this.db.prepare(`SELECT DISTINCT c.id,r.id AS revision_id FROM canonical_questions c JOIN canonical_question_revisions r ON r.id=c.current_revision_id JOIN question_occurrences o ON o.canonical_question_id=c.id AND o.content_revision_id=r.id WHERE c.scope_id=? AND c.subject='math' AND c.status='active' AND r.identity_status='ready' AND r.normalized_text=? AND o.occurrence_hash=? AND o.mapping_status='confirmed'`).bind(this.scope, normalized, imageHash).all<{ id: string; revision_id: string }>();
    if (matches.results.length > 1) throw new StudentImportError('存在多个相同内容身份，请先核对统一题库。');
    const identityHash = hash(JSON.stringify(['student-image-v1', normalized, imageHash]));
    const canonicalId = matches.results[0]?.id || uuid(`${this.scope}:student:${identityHash}`);
    const revisionId = matches.results[0]?.revision_id || uuid(`${canonicalId}:revision:1`);
    const sourceId = uuid(`${this.scope}:student-source:${id}`), occurrenceId = uuid(`${this.scope}:student-occurrence:${id}`);
    const savedClassification = { ...classification, extracted_question: text };
    delete savedClassification.analysis_trace;
    const payload = JSON.stringify({ identity: { subject: 'math', normalized_text: normalized, image_sha256: imageHash }, classification: savedClassification, human_review: { reviewer: this.owner, reviewed_at: new Date().toISOString(), content_complete: true, private_scope_confirmed: true }, normalized_text_hash: hash(normalized) });
    const statements: D1PreparedStatement[] = [];
    const sourceChecks = Object.keys(row).map(column => `q."${column.replaceAll('"', '""')}" IS ?`).join(' AND ');
    // A CHECK failure rolls back the entire batch if the preview became stale or a mapping raced.
    statements.push(this.db.prepare(`INSERT INTO canonical_questions(id,scope_id,status) SELECT ?,?,'guard_failed' WHERE NOT EXISTS(SELECT 1 FROM questions q JOIN students s ON s.id=q.student_id WHERE ${sourceChecks} AND q.deleted_at IS NULL AND s.deleted_at IS NULL) OR NOT EXISTS(SELECT 1 FROM question_library_scopes WHERE id=? AND code='project-private' AND kind='private' AND ownership_status='known' AND owner_principal_id='project_owner') OR EXISTS(SELECT 1 FROM question_module_links WHERE module_type='student_question' AND module_record_id=? AND (canonical_question_id<>? OR observed_source_hash<>?))`).bind(uuid(`guard:${snapshot}`), this.scope, ...Object.values(row), this.scope, String(id), canonicalId, snapshot));
    if (!matches.results.length) {
      statements.push(this.db.prepare("INSERT OR IGNORE INTO canonical_questions(id,scope_id,subject,status) VALUES(?,?,'math','provisional')").bind(canonicalId, this.scope));
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO canonical_question_revisions(id,canonical_question_id,revision,subject,education_stage,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,identity_status,change_reason,created_by) VALUES(?,?,1,'math',?,?,?,?,'student-reviewed-v1','student-image-v1',?,'ready','教师核对学生题后加入统一题库',?)`).bind(revisionId, canonicalId, classification.education_stage, text, normalized, identityHash, payload, this.owner));
      statements.push(this.db.prepare("UPDATE canonical_questions SET current_revision_id=?,status='active' WHERE id=? AND current_revision_id IS NULL").bind(revisionId, canonicalId));
    }
    statements.push(this.db.prepare(`INSERT OR IGNORE INTO source_documents(id,scope_id,source_type,title,legacy_source_key,file_storage,storage_key,original_filename,mime_type,file_hash) VALUES(?,?,'student_archive',?,?,'r2',?,?,?,?)`).bind(sourceId, this.scope, `学生归档题 #${id}`, String(id), row.image_key, row.original_filename, row.image_mime_type, imageHash));
    statements.push(this.db.prepare(`INSERT OR IGNORE INTO question_occurrences(id,canonical_question_id,content_revision_id,source_document_id,source_type,occurrence_key,source_locator_json,image_key,original_filename,raw_text,occurrence_hash,metadata,mapping_status) VALUES(?,?,?,?,'student_archive',?,?,?,?,?,?,?,'confirmed')`).bind(occurrenceId, canonicalId, revisionId, sourceId, `student_question:${id}`, JSON.stringify({ question_id: id }), row.image_key, row.original_filename, text, imageHash, JSON.stringify({ reviewer: this.owner, import_stage: 'student-button' })));
    statements.push(this.db.prepare(`INSERT OR IGNORE INTO question_module_links(id,module_type,module_record_id,canonical_question_id,occurrence_id,legacy_student_question_id,observed_source_hash) VALUES(?,'student_question',?,?,?,?,?)`).bind(uuid(`${this.scope}:student-link:${id}`), String(id), canonicalId, occurrenceId, id, snapshot));
    try { await this.db.batch(statements); } catch { throw new StudentImportError('入库未完成，题目可能已变化；请重新打开核对窗口后重试。'); }
    return { canonicalId, reused: Boolean(matches.results.length), knowledgeGraph: await tryAttachKnowledge(this.db, this.owner, [this.scope], canonicalId) };
  }
}

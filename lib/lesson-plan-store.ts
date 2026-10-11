import { lessonContentSchema, lessonDraftSchema, lessonWriteSchema, type LessonContent, type LessonPlan, type LessonWrite } from './lesson-plan';
import { validateLessonStructure } from './lesson-structure';
import { libraryBase } from './math-library-query';
import { librarySourcesSql } from './math-library-sources';
import { libraryExplanation } from './math-library-explanation';
import type { LessonAIQuestion } from './lesson-generation';
import type { LessonExportSnapshot } from './lesson-export';
import { canonicalSolutions } from './canonical-solutions';

export class LessonError extends Error { constructor(message: string, public status: number) { super(message); } }
// Inject the binding so tests execute the same SQL with isolated SQLite transactions.
export class LessonStore {
  constructor(private db: D1Database, private owner: string, private scopes: string[]) {
    if (!owner) throw new LessonError('请先登录。', 401);
  }
  async list(stage = '', topic = '', status = 'active') {
    if (!['', '初中', '高中'].includes(stage) || !['active', 'archived', 'all'].includes(status) || topic.length > 160)
      throw new LessonError('筛选条件无效。', 400);
    const conditions = ['owner_id=?'], values: string[] = [this.owner];
    if (stage) { conditions.push('stage=?'); values.push(stage); }
    if (topic) { conditions.push("topic LIKE ? ESCAPE '\\'"); values.push('%' + topic.replace(/[\\%_]/g, '\\$&') + '%'); }
    if (status !== 'all') conditions.push(status === 'archived' ? "status='archived'" : "status!='archived'");
    return (await this.db.prepare(`SELECT id,topic,stage,status,revision,created_at,updated_at FROM lesson_plans WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC,id`).bind(...values).all()).results;
  }
  private async row(id: string) {
    const row = await this.db.prepare('SELECT * FROM lesson_plans WHERE id=? AND owner_id=?').bind(id, this.owner).first<Record<string, unknown>>();
    if (!row) throw new LessonError('教案不存在或无权访问。', 404);
    return row;
  }
  async resources(content: LessonContent) {
    const resources: LessonPlan['resources'] = [];
    for (const q of content.questions) {
      if (!this.scopes.length) throw new LessonError('无权访问引用题目。', 403);
      const row = await this.db.prepare(`SELECT r.original_text,r.identity_status,
        (SELECT o.id FROM question_occurrences o JOIN source_documents s ON s.id=o.source_document_id AND s.scope_id=c.scope_id
         WHERE o.canonical_question_id=c.id AND o.content_revision_id=r.id AND o.mapping_status!='detached' AND o.image_key IS NOT NULL AND o.image_key!='' ORDER BY o.id LIMIT 1) image_id
        FROM canonical_questions c JOIN canonical_question_revisions r ON r.canonical_question_id=c.id
        WHERE c.id=? AND r.id=? AND c.subject='math' AND r.subject='math' AND c.scope_id IN (${this.scopes.map(() => '?').join(',')})`).bind(q.canonicalId, q.revisionId, ...this.scopes).first<{ original_text: string; identity_status: string; image_id: string | null }>();
      if (!row) throw new LessonError('题目引用不存在、版本不匹配或无权访问。', 400);
      resources.push({ canonicalId: q.canonicalId, revisionId: q.revisionId, text: row.original_text, identityStatus: row.identity_status,
        imageUrl: row.image_id ? `/api/math-library/${q.canonicalId}/image/${row.image_id}` : null });
    }
    return resources;
  }
  async aiQuestions(content: LessonContent): Promise<LessonAIQuestion[]> {
    await this.resources(content);
    const questions: LessonAIQuestion[] = [];
    for (const selected of content.questions) {
      const row = await this.db.prepare(libraryBase(this.scopes, true) + 'SELECT c.* FROM library c WHERE c.id=?')
        .bind(selected.revisionId, ...this.scopes, selected.canonicalId).first<{ original_text: string; classification: string | null; stage: string | null; identity_status: string; scope_id: string }>();
      if (!row) throw new LessonError('所选题目已失效或不可访问，请重新选题；原教案保留。', 422);
      const sources = (await this.db.prepare(librarySourcesSql).bind(row.original_text, row.original_text, row.original_text, row.original_text, row.scope_id, selected.canonicalId).all<Record<string, unknown>>()).results
        .filter(s => s.content_revision_id === selected.revisionId);
      const explanations = sources.map(s => libraryExplanation(s.explanation, s.explanation_reviewed, row.original_text, true));
      const reviewed = explanations.find(e => e.explanationReviewed === true && e.explanation?.status === 'ready');
      const approvedSolutions = (await canonicalSolutions(this.db, this.owner, this.scopes, selected.canonicalId, selected.revisionId))
        .filter(s => s.review && s.review.quality.verdict === 'no_obvious_error');
      let classification: { knowledge_points?: { code: string; name: string }[]; difficulty?: string; question_type?: string } | null = null;
      try { classification = row.classification ? (typeof row.classification === 'string' ? JSON.parse(row.classification) : row.classification) : null; } catch { /* Unavailable metadata stays explicit. */ }
      const reviewRow = await this.db.prepare('SELECT payload FROM canonical_question_revisions WHERE id=? AND canonical_question_id=?').bind(selected.revisionId, selected.canonicalId).first<{ payload: string }>();
      let knowledgeReviewed = false;
      try {
        const payload = JSON.parse(reviewRow?.payload || '{}');
        knowledgeReviewed = Boolean(payload.classification && payload.human_review?.reviewer && payload.human_review?.reviewed_at && payload.human_review?.content_complete === true);
      } catch { /* No explicit human evidence means unknown, not reviewed. */ }
      questions.push({ canonicalId: selected.canonicalId, revisionId: selected.revisionId, text: row.original_text, stage: row.stage, identityStatus: row.identity_status,
        knowledge: classification?.knowledge_points || [], knowledgeReviewed, difficulty: classification?.difficulty || null, questionType: classification?.question_type || null,
        sources: sources.map(s => ({ title: String(s.title), questionNumber: s.question_number ? String(s.question_number) : null, page: typeof s.page === 'number' ? s.page : null })),
          answerStatus: reviewed || approvedSolutions.length ? 'reviewed' : explanations.some(e => e.explanation) ? 'unverified' : 'missing', reviewedExplanation: reviewed?.explanation || null, approvedSolutions });
    }
    return questions;
  }
  async exportSnapshot(id: string, versionId: string): Promise<LessonExportSnapshot> {
    const plan = await this.get(id, versionId), version = plan.versions.find(v => v.id === versionId);
    if (!version) throw new LessonError('导出版本不存在。', 404);
    lessonContentSchema.parse(plan.content);
    const records = await this.aiQuestions(plan.content);
    const questions: LessonExportSnapshot['questions'] = [];
    for (const question of records) {
      const rows = (await this.db.prepare(`SELECT o.id,o.image_key FROM question_occurrences o
        JOIN source_documents s ON s.id=o.source_document_id JOIN canonical_questions c ON c.id=o.canonical_question_id AND c.scope_id=s.scope_id
        WHERE c.id=? AND o.content_revision_id=? AND o.mapping_status!='detached' AND o.image_key IS NOT NULL AND o.image_key!=''
        AND c.scope_id IN (${this.scopes.map(() => '?').join(',')}) ORDER BY o.created_at,o.id`).bind(question.canonicalId, question.revisionId, ...this.scopes).all<{ id: string; image_key: string }>()).results;
      const seen = new Set<string>(), images = rows.filter(row => { if (seen.has(row.image_key)) return false; seen.add(row.image_key); return true; }).map(row => ({ id: row.id, url: `/api/math-library/${question.canonicalId}/image/${row.id}` }));
      if ((!question.text.trim() || question.identityStatus === 'incomplete') && !images.length) throw new LessonError('引用题目缺少完整题干或原图，请补全题库记录后导出。', 422);
      questions.push({ ...question, images });
    }
    return { planId: id, versionId, revision: version.revision, status: plan.status, content: plan.content, questions };
  }
  async get(id: string, versionId?: string): Promise<LessonPlan> {
    const row = await this.row(id);
    let content = lessonDraftSchema.parse(JSON.parse(String(row.content)));
    if (versionId) {
      const v = await this.db.prepare('SELECT content FROM lesson_plan_versions WHERE id=? AND plan_id=?').bind(versionId, id).first<{ content: string }>();
      if (!v) throw new LessonError('版本不存在。', 404);
      content = lessonDraftSchema.parse(JSON.parse(v.content));
    }
    const versions = (await this.db.prepare('SELECT id,revision,created_at FROM lesson_plan_versions WHERE plan_id=? ORDER BY revision DESC').bind(id).all<LessonPlan['versions'][number]>()).results;
    return { id, revision: Number(row.revision), current_version_id: String(row.current_version_id), status: row.status as LessonPlan['status'],
      created_at: String(row.created_at), updated_at: String(row.updated_at), content, versions, resources: await this.resources(content) };
  }
  async write(id: string, input: LessonWrite, create = false) {
    input = lessonWriteSchema.parse(input);
    if (new Set(input.content.questions.map(q => q.canonicalId)).size !== input.content.questions.length) throw new LessonError('同一 Canonical 题目不能重复添加。', 400);
    if (input.content.structure) validateLessonStructure(input.content.structure, input.content.questions, input.content.structure.stages.reduce((sum, s) => sum + s.minutes, 0));
    const previous = await this.db.prepare('SELECT * FROM lesson_plans WHERE id=? AND owner_id=?').bind(id, this.owner).first<Record<string, unknown>>();
    if (previous?.current_version_id === input.operationId) {
      if (previous.content !== JSON.stringify(input.content) || previous.status !== input.status)
        throw new LessonError('重复提交编号不能用于不同内容。', 409);
      return this.get(id);
    }
    if (create ? previous || input.expectedRevision !== 0 : !previous)
      throw new LessonError(create ? '教案已存在，请重新打开。' : '教案不存在或无权访问。', create ? 409 : 404);
    if (!create && Number(previous!.revision) !== input.expectedRevision)
      throw new LessonError('教案已被其他窗口修改。当前草稿已保留，请先查看服务器版本，再复制草稿或重新载入。', 409);
    await this.resources(input.content);
    const now = new Date().toISOString(), revision = input.expectedRevision + 1, json = JSON.stringify(input.content);
    const statements = [create
      ? this.db.prepare('INSERT INTO lesson_plans(id,owner_id,topic,stage,status,revision,current_version_id,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, this.owner, input.content.topic, input.content.stage, input.status, revision, input.operationId, json, now, now)
      : this.db.prepare('UPDATE lesson_plans SET topic=?,stage=?,status=?,revision=?,current_version_id=?,content=?,updated_at=? WHERE id=? AND owner_id=? AND revision=?').bind(input.content.topic, input.content.stage, input.status, revision, input.operationId, json, now, id, this.owner, input.expectedRevision)];
    // Losing CAS requests insert nothing. The operation UUID identifies the winning write.
    statements.push(this.db.prepare(`INSERT INTO lesson_plan_versions(id,plan_id,revision,content,status,created_at)
      SELECT ?,id,revision,content,status,updated_at FROM lesson_plans WHERE id=? AND owner_id=? AND current_version_id=?
      AND NOT EXISTS(SELECT 1 FROM lesson_plan_versions WHERE id=?)`).bind(input.operationId, id, this.owner, input.operationId, input.operationId));
    input.content.questions.forEach((q, position) => statements.push(this.db.prepare(`INSERT INTO lesson_plan_questions(version_id,position,canonical_id,revision_id,purpose,notes)
      SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM lesson_plans WHERE id=? AND owner_id=? AND current_version_id=?)
      AND NOT EXISTS(SELECT 1 FROM lesson_plan_questions WHERE version_id=? AND position=?)`).bind(input.operationId, position, q.canonicalId, q.revisionId, q.purpose, q.notes, id, this.owner, input.operationId, input.operationId, position)));
    let results: D1Result[];
    try { results = await this.db.batch(statements); }
    catch (error) {
      // A concurrent retry may have committed while this request validated references.
      const committed = await this.db.prepare('SELECT current_version_id,content,status FROM lesson_plans WHERE id=? AND owner_id=?').bind(id, this.owner).first<Record<string, unknown>>();
      if (committed?.current_version_id === input.operationId && committed.content === json && committed.status === input.status) return this.get(id);
      throw error;
    }
    if (!results[0].meta.changes) {
      const committed = await this.db.prepare('SELECT current_version_id,content,status FROM lesson_plans WHERE id=? AND owner_id=?').bind(id, this.owner).first<Record<string, unknown>>();
      if (committed?.current_version_id === input.operationId && committed.content === json && committed.status === input.status) return this.get(id);
      throw new LessonError('保存冲突，草稿未覆盖服务器内容。', 409);
    }
    return this.get(id);
  }
}

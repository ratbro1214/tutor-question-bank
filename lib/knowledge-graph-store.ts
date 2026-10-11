import { z } from 'zod';
import { libraryBase } from './math-library-query';
import { canonicalSolutions } from './canonical-solutions';
import { chaptersForStage, taxonomyForStage } from './taxonomy';
import { methodWriteSchema, relationWriteSchema, relationKey, similarMethods, type GraphMethod, type GraphRelation, type GraphSource, type GraphSnapshot, type GraphQuestion, type MethodWrite, type RelationWrite } from './knowledge-graph';

export class GraphError extends Error { constructor(message: string, public status = 400) { super(message); } }
type Row = Record<string, unknown>;
const parse = (s: unknown) => JSON.parse(String(s));
async function fingerprint(value: unknown) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))); return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join(''); }
export class KnowledgeGraphStore {
  constructor(public db: D1Database, public owner: string, public scopes: string[]) { if (!owner) throw new GraphError('请先登录。', 401); }
  private scope(id: string) { if (!this.scopes.includes(id)) throw new GraphError('无权访问此题库范围。', 403); }
  private async row(table: 'math_methods' | 'math_knowledge_relations', id: string) {
    const r = await this.db.prepare(`SELECT * FROM ${table} WHERE id=? AND owner_id=?`).bind(id, this.owner).first<Row>();
    if (!r || !this.scopes.includes(String(r.scope_id))) throw new GraphError('记录不存在或无权访问。', 404); return r;
  }
  private method(r: Row, evidenceValid = true): GraphMethod { return { id: String(r.id), scope_id: String(r.scope_id), revision: Number(r.revision), status: r.status as GraphMethod['status'], content: parse(r.content), source: parse(r.source), merged_into: r.merged_into ? String(r.merged_into) : null, updated_at: String(r.updated_at), evidenceValid }; }
  private relation(r: Row, evidenceValid = true): GraphRelation { return { id: String(r.id), scope_id: String(r.scope_id), revision: Number(r.revision), status: r.status as GraphRelation['status'], type: r.type as GraphRelation['type'], from_knowledge: r.from_knowledge as number | null, to_knowledge: r.to_knowledge as number | null, method_id: r.method_id as string | null, canonical_id: r.canonical_id as string | null, revision_id: r.revision_id as string | null, source: parse(r.source), reviewer: r.reviewer as string | null, updated_at: String(r.updated_at), evidenceValid }; }
  async question(id: string, revision?: string) {
    if (!this.scopes.length) throw new GraphError('无权访问题目。', 403);
    const row = await this.db.prepare(libraryBase(this.scopes) + 'SELECT * FROM library WHERE id=?').bind(...this.scopes, id).first<Row>();
    if (!row || (revision && revision !== row.current_revision_id)) throw new GraphError('题目不存在、版本已变化或无权访问。', 404); return row;
  }
  async evidence(id: string, revision: string, reviewId: string) {
    const q = await this.question(id, revision);
    const source = (await canonicalSolutions(this.db, this.owner, [String(q.scope_id)], id, revision)).find(s => s.reviewId === reviewId && s.review?.quality.verdict === 'no_obvious_error');
    if (!source?.review) throw new GraphError('没有仍有效的教师已审核解法；请先完成 5B 审核。', 422);
    const metadata = await this.db.prepare('SELECT model,prompt_version FROM paper_solution_reviews WHERE id=?').bind(reviewId).first<{ model: string; prompt_version: string }>();
    return { source, evidence: { canonicalId: id, revisionId: revision, reviewId, matchRevision: source.matchRevision, fingerprint: await fingerprint(source), model: metadata?.model || '', promptVersion: metadata?.prompt_version || '' } };
  }
  private async validSource(source: GraphSource) {
    if (!source.evidence) return true;
    try { const e = source.evidence; const current = await this.evidence(e.canonicalId, e.revisionId, e.reviewId); return current.evidence.fingerprint === e.fingerprint && current.evidence.matchRevision === e.matchRevision; } catch (e) { if (e instanceof GraphError) return false; throw e; }
  }
  private async validateSource(source: GraphSource, scope: string) {
    if (source.origin === 'ai' && !source.evidence) throw new GraphError('AI 候选必须引用已审核通法。');
    if (source.evidence) {
      const q = await this.question(source.evidence.canonicalId, source.evidence.revisionId);
      if (q.scope_id !== scope || !await this.validSource(source)) throw new GraphError('来源范围或版本不匹配，请重新提取。', 422);
    }
  }
  async getMethod(id: string) {
    const r = await this.row('math_methods', id), m = this.method(r, await this.validSource(parse(r.source)));
    const versions = (await this.db.prepare('SELECT revision,actor,created_at,snapshot FROM math_method_versions WHERE method_id=? ORDER BY revision DESC').bind(id).all<Row>()).results;
    const visibleVersions = [];
    for (const version of versions) { const snapshot = parse(version.snapshot); if (await this.validSource(parse(snapshot.source))) visibleVersions.push({ ...version, snapshot: { ...snapshot, content: parse(snapshot.content), source: parse(snapshot.source) } }); else visibleVersions.push({ revision: version.revision, actor: version.actor, created_at: version.created_at, unavailable: '来源版本失效，历史仍保留' }); }
    // Invalid references cannot expose source metadata after scope access is revoked.
    return { ...m, source: m.evidenceValid ? m.source : { origin: m.source.origin, note: '来源不可访问或已失效', evidence: null }, versions: visibleVersions };
  }
  async getRelation(id: string) { const r = await this.row('math_knowledge_relations', id); return this.relation(r, await this.validSource(parse(r.source))); }
  async relationHistory(id: string) {
    const current = await this.getRelation(id);
    const rows = (await this.db.prepare('SELECT revision,actor,created_at,snapshot FROM math_relation_versions WHERE relation_id=? ORDER BY revision DESC').bind(id).all<Row>()).results;
    const versions = [];
    for (const r of rows) { const s = parse(r.snapshot); versions.push({ revision: r.revision, actor: r.actor, created_at: r.created_at, type: s.type, status: s.status, note: (await this.validSource(parse(s.source))) ? parse(s.source).note : '来源已失效，历史仍保留' }); }
    return { current, versions };
  }
  async writeMethod(id: string, raw: MethodWrite) {
    const input = methodWriteSchema.parse(raw); this.scope(input.scopeId);
    const previous = await this.db.prepare('SELECT * FROM math_methods WHERE id=?').bind(id).first<Row>();
    if (previous) { await this.row('math_methods', id); if (previous.scope_id !== input.scopeId || previous.merged_into) throw new GraphError('范围不可修改；已合并方法请编辑目标卡。', 409); }
    if (previous?.operation_id === input.operationId) { if (previous.content !== JSON.stringify(input.content) || previous.source !== JSON.stringify(input.source) || previous.status !== input.status) throw new GraphError('重复提交编号不能用于不同内容。', 409); return this.getMethod(id); }
    if (Number(previous?.revision || 0) !== input.expectedRevision) throw new GraphError('方法版本已更新，请重新载入。', 409);
    // Extraction creates candidates only. An explicit subsequent teacher write can approve them.
    if (!previous && input.source.origin === 'ai' && input.status !== 'candidate') throw new GraphError('AI 提取必须先保存为候选。');
    if (input.status === 'approved' && input.content.limitations.some(line => line.startsWith('原通法未明确给出局限'))) throw new GraphError('请教师补充真实适用局限后再审核。');
    if (input.status !== 'rejected') await this.validateSource(input.source, input.scopeId);
    const now = new Date().toISOString(), json = JSON.stringify(input.content), source = JSON.stringify(input.source), reviewer = input.status === 'candidate' ? null : this.owner;
    const statement = previous ? this.db.prepare('UPDATE math_methods SET revision=revision+1,operation_id=?,status=?,content=?,source=?,reviewer=?,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND merged_into IS NULL').bind(input.operationId, input.status, json, source, reviewer, now, id, this.owner, input.expectedRevision)
      : this.db.prepare('INSERT INTO math_methods(id,owner_id,scope_id,revision,operation_id,status,content,source,reviewer,created_at,updated_at) VALUES(?,?,?,1,?,?,?,?,?,?,?)').bind(id, this.owner, input.scopeId, input.operationId, input.status, json, source, reviewer, now, now);
    await this.db.batch([this.lock(input.operationId), statement, this.methodVersion(id, input.operationId, now)]);
    const saved = await this.row('math_methods', id); if (saved.operation_id !== input.operationId) throw new GraphError('方法版本冲突，未覆盖已保存内容。', 409); return this.getMethod(id);
  }
  private lock(token: string) { return this.db.prepare('INSERT INTO math_graph_locks(owner_id,token) VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET token=excluded.token').bind(this.owner, token); }
  private methodVersion(id: string, op: string, now: string) { return this.db.prepare(`INSERT INTO math_method_versions(operation_id,method_id,revision,snapshot,actor,created_at)
    SELECT ?,id,revision,json_object('content',content,'source',source,'status',status,'mergedInto',merged_into),?,? FROM math_methods WHERE id=? AND owner_id=? AND operation_id=?`).bind(op, this.owner, now, id, this.owner, op); }
  async writeRelation(id: string, raw: RelationWrite) {
    const input = relationWriteSchema.parse(raw); this.scope(input.scopeId);
    const previous = await this.db.prepare('SELECT * FROM math_knowledge_relations WHERE id=?').bind(id).first<Row>();
    if (previous) { await this.row('math_knowledge_relations', id); if (previous.scope_id !== input.scopeId) throw new GraphError('关系范围不可修改。'); }
    const key = relationKey(input), source = JSON.stringify(input.source);
    if (previous?.operation_id === input.operationId) { if (previous.relation_key !== key || previous.source !== source || previous.status !== input.status) throw new GraphError('重复提交编号不能用于不同内容。', 409); return this.getRelation(id); }
    if (Number(previous?.revision || 0) !== input.expectedRevision) throw new GraphError('关系版本已更新，请重新载入。', 409);
    if (!previous && input.source.origin === 'ai' && input.status !== 'candidate') throw new GraphError('AI 关系必须先保存为候选。');
    const duplicate = await this.db.prepare('SELECT id FROM math_knowledge_relations WHERE owner_id=? AND scope_id=? AND relation_key=? AND id<>?').bind(this.owner, input.scopeId, key, id).first<{ id: string }>();
    if (duplicate) throw new GraphError('同一证据关系已存在，请编辑原关系。', 409);
    for (const kp of [input.fromKnowledge, input.toKnowledge].filter(k => k !== null)) if (!await this.db.prepare('SELECT id FROM knowledge_points WHERE id=?').bind(kp).first()) throw new GraphError('知识点不存在。');
    if (input.methodId) { const method = await this.row('math_methods', input.methodId); if (method.scope_id !== input.scopeId || method.merged_into) throw new GraphError('方法范围不匹配或已合并。'); }
    if (input.status !== 'rejected') await this.validateSource(input.source, input.scopeId);
    if (input.type === 'uses') {
      const q = await this.question(input.canonicalId!, input.status === 'rejected' ? undefined : input.revisionId!);
      const e = input.source.evidence!; if (q.scope_id !== input.scopeId || e.canonicalId !== input.canonicalId || e.revisionId !== input.revisionId) throw new GraphError('题目解法证据不匹配。');
    }
    const now = new Date().toISOString(), reviewer = input.status === 'candidate' ? null : this.owner;
    const values = [key, input.type, input.fromKnowledge, input.toKnowledge, input.methodId, input.canonicalId, input.revisionId, input.type === 'uses' ? input.source.evidence?.reviewId || null : null, input.operationId, input.status, source, reviewer, now];
    const statement = previous ? this.db.prepare('UPDATE math_knowledge_relations SET relation_key=?,type=?,from_knowledge=?,to_knowledge=?,method_id=?,canonical_id=?,revision_id=?,review_id=?,operation_id=?,status=?,source=?,reviewer=?,updated_at=?,revision=revision+1 WHERE id=? AND owner_id=? AND revision=?').bind(...values, id, this.owner, input.expectedRevision)
      : this.db.prepare('INSERT INTO math_knowledge_relations(id,owner_id,scope_id,revision,relation_key,type,from_knowledge,to_knowledge,method_id,canonical_id,revision_id,review_id,operation_id,status,source,reviewer,updated_at) VALUES(?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, this.owner, input.scopeId, ...values);
    try { await this.db.batch([this.lock(input.operationId), statement,
      this.db.prepare(`INSERT INTO math_relation_versions(operation_id,relation_id,revision,snapshot,actor,created_at)
      SELECT ?,id,revision,json_object('type',type,'fromKnowledge',from_knowledge,'toKnowledge',to_knowledge,'methodId',method_id,'canonicalId',canonical_id,'revisionId',revision_id,'status',status,'source',source,'reviewer',reviewer),?,? FROM math_knowledge_relations WHERE id=? AND owner_id=? AND operation_id=?`).bind(input.operationId, this.owner, now, id, this.owner, input.operationId)]); }
    catch (e) { if (/cycle|UNIQUE/.test(String(e))) throw new GraphError('关系形成循环或重复关联，已拒绝。', 409); throw e; }
    const saved = await this.row('math_knowledge_relations', id); if (saved.operation_id !== input.operationId) throw new GraphError('关系版本冲突，未覆盖已保存内容。', 409); return this.getRelation(id);
  }
  async revokeRelation(id: string, expectedRevision: number, operationId: string) { const r = await this.getRelation(id); return this.writeRelation(id, { operationId, expectedRevision, scopeId: r.scope_id, status: 'rejected', type: r.type, fromKnowledge: r.from_knowledge, toKnowledge: r.to_knowledge, methodId: r.method_id, canonicalId: r.canonical_id, revisionId: r.revision_id, source: r.source }); }
  async methods(approved = true, scopeId?: string) {
    if (scopeId) this.scope(scopeId); const scopes = scopeId ? [scopeId] : this.scopes; if (!scopes.length) return [];
    const rows = (await this.db.prepare(`SELECT * FROM math_methods WHERE owner_id=? AND scope_id IN (${scopes.map(() => '?')}) AND merged_into IS NULL ${approved ? "AND status='approved'" : ''} ORDER BY updated_at DESC LIMIT 300`).bind(this.owner, ...scopes).all<Row>()).results;
    const output: GraphMethod[] = []; for (const row of rows) { const valid = await this.validSource(parse(row.source)); if (!approved || valid) output.push(this.method(row, valid)); } return output;
  }
  async relations(approved = true, scopeId?: string, selector?: { knowledgeId?: number; methodId?: string; canonicalId?: string; chapterCode?: string }) {
    if (scopeId) this.scope(scopeId); const scopes = scopeId ? [scopeId] : this.scopes; if (!scopes.length) return [];
    const conditions = ['r.owner_id=?', `r.scope_id IN (${scopes.map(() => '?')})`], binds: (string | number)[] = [this.owner, ...scopes];
    if (approved) conditions.push("r.status='approved' AND (r.method_id IS NULL OR (m.status='approved' AND (m.merged_into IS NULL OR target.status='approved'))) ");
    if (selector?.knowledgeId) { conditions.push('(r.from_knowledge=? OR r.to_knowledge=?)'); binds.push(selector.knowledgeId, selector.knowledgeId); }
    if (selector?.methodId) { await this.row('math_methods', selector.methodId); conditions.push('(m.id=? OR m.merged_into=?)'); binds.push(selector.methodId, selector.methodId); }
    if (selector?.canonicalId) { await this.question(selector.canonicalId); conditions.push('r.canonical_id=?'); binds.push(selector.canonicalId); }
    if (selector?.chapterCode) { conditions.push('EXISTS(SELECT 1 FROM knowledge_points kp WHERE kp.chapter_code=? AND kp.id IN (r.from_knowledge,r.to_knowledge))'); binds.push(selector.chapterCode); }
    const rows = (await this.db.prepare(`SELECT r.*,m.source AS method_source,target.source AS target_source,COALESCE(m.merged_into,r.method_id) AS resolved_method,json_extract(COALESCE(target.content,m.content),'$.name') AS method_name FROM math_knowledge_relations r LEFT JOIN math_methods m ON m.id=r.method_id LEFT JOIN math_methods target ON target.id=m.merged_into WHERE ${conditions.join(' AND ')} ORDER BY r.id LIMIT 500`).bind(...binds).all<Row>()).results;
    const output: GraphRelation[] = [];
    for (const row of rows) { const valid = await this.validSource(parse(row.source)) && (!row.method_source || await this.validSource(parse(row.method_source))) && (!row.target_source || await this.validSource(parse(row.target_source)));
      if (!approved || valid) { const r = this.relation(row, valid); r.method_id = row.resolved_method as string | null; if (row.method_name) r.method_name = String(row.method_name); output.push(r); } }
    return output;
  }
  async snapshot(stage = '高中', chapter = 'HS-DERIVATIVE', approved = true, scopeId?: string): Promise<GraphSnapshot> {
    if (!['高中', '初中'].includes(stage) || !chaptersForStage(stage as '高中' | '初中').some(c => c[0] === chapter)) throw new GraphError('学段或章节无效。');
    const expected = taxonomyForStage(stage as '高中' | '初中').filter(k => k[2] === chapter), codes = expected.map(k => k[0]);
    const knowledge = codes.length ? (await this.db.prepare(`SELECT * FROM knowledge_points WHERE code IN (${codes.map(() => '?')}) ORDER BY code`).bind(...codes).all<{ id: number; code: string; name: string; chapter_code: string }>()).results : [];
    const ids = new Set(knowledge.map(k => k.id)), relations = (await this.relations(approved, scopeId, { chapterCode: chapter })).filter(r => r.type !== 'uses' && (ids.has(r.from_knowledge!) || ids.has(r.to_knowledge!)));
    // Include direct prerequisites in other chapters without loading the full taxonomy.
    const extraIds = [...new Set(relations.flatMap(r => [r.from_knowledge, r.to_knowledge]).filter((id): id is number => id !== null && !ids.has(id)))];
    const extra = extraIds.length ? (await this.db.prepare(`SELECT * FROM knowledge_points WHERE id IN (${extraIds.map(() => '?')})`).bind(...extraIds).all<typeof knowledge[number]>()).results : [];
    const methodIds = new Set(relations.map(r => r.method_id)); const methods = (await this.methods(approved, scopeId)).filter(m => methodIds.has(m.id));
    return { knowledge: [...knowledge, ...extra].map(k => ({ ...k, chapter: chaptersForStage(k.code.startsWith('HS-') ? '高中' : '初中').find(c => c[0] === k.chapter_code)?.[1] || k.chapter_code, stage: k.code.startsWith('HS-') ? '高中' : '初中', description: null })), methods, relations, scopes: this.scopes, chapter, stage };
  }
  async questions(input: { knowledge?: string; methodId?: string; canonicalId?: string; page?: number; approved?: boolean; scopeId?: string }) {
    const { knowledge = '', methodId = '', canonicalId = '', page = 1, approved = true } = input;
    if (!knowledge && !methodId && !canonicalId) throw new GraphError('请指定一个展开节点。');
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new GraphError('分页无效。');
    if (methodId) await this.row('math_methods', methodId); if (canonicalId) await this.question(canonicalId);
    if (input.scopeId) this.scope(input.scopeId); const scopes = input.scopeId ? [input.scopeId] : this.scopes;
    const conditions: string[] = [], binds: (string | number)[] = [...scopes];
    if (knowledge) { conditions.push("EXISTS(SELECT 1 FROM json_each(c.classification,'$.knowledge_points') kp WHERE json_extract(kp.value,'$.code')=?)"); binds.push(knowledge); }
    if (canonicalId) { conditions.push('c.id=?'); binds.push(canonicalId); }
    if (methodId) { conditions.push(`EXISTS(SELECT 1 FROM math_knowledge_relations r JOIN math_methods m ON m.id=r.method_id WHERE r.canonical_id=c.id AND r.revision_id=c.current_revision_id AND r.owner_id=? AND r.scope_id=c.scope_id AND (m.id=? OR m.merged_into=?) ${approved ? "AND r.status='approved' AND m.status='approved'" : ''})`); binds.push(this.owner, methodId, methodId); }
    const count = await this.db.prepare(libraryBase(scopes) + `SELECT count(*) total FROM library c WHERE ${conditions.join(' AND ')}`).bind(...binds).first<{ total: number }>();
    const rows = (await this.db.prepare(libraryBase(scopes) + `SELECT c.* FROM library c WHERE ${conditions.join(' AND ')} ORDER BY c.id LIMIT 20 OFFSET ?`).bind(...binds, (page - 1) * 20).all<Row>()).results;
    const items: GraphQuestion[] = [];
    for (const row of rows) {
      const reviewed = (await canonicalSolutions(this.db, this.owner, [String(row.scope_id)], String(row.id), String(row.current_revision_id))).some(s => s.review?.quality.verdict === 'no_obvious_error');
      const methods = await this.relations(approved, String(row.scope_id), { canonicalId: String(row.id) });
      if (approved && (!reviewed || (methodId && !methods.some(r => r.method_id === methodId && r.type === 'uses')))) continue;
      items.push({ id: String(row.id), current_revision_id: String(row.current_revision_id), original_text: String(row.original_text), classification: row.classification ? parse(row.classification) : null, reviewed, methods });
    }
    return { items, total: count?.total || 0, page, pageSize: 20, hasMore: page * 20 < (count?.total || 0), reviewBasis: '总数按现有分类与关系匹配统计；items 另按教师接受且仍有效的 5B 解析筛选。分类不额外宣称已审核' };
  }
  async candidates(canonicalId: string, revisionId: string, reviewId: string) {
    const { source, evidence } = await this.evidence(canonicalId, revisionId, reviewId), m = source.review!.methods?.method;
    if (!m) throw new GraphError('该已审核解法没有合格通法，请在 5B 中补充。', 422);
    const content = methodWriteSchema.shape.content.parse({ name: m.model, summary: source.review!.quality.originalIdea || source.review!.quality.summary, typicalProblems: m.features, conditions: m.conditions, steps: m.steps,
      limitations: source.review!.quality.limitations.length ? source.review!.quality.limitations : ['原通法未明确给出局限；教师补充并核对等价条件后再审核。'], mistakes: m.mistakes, variants: m.variants });
    return { content, source: { origin: 'ai' as const, note: '复用已审核 5B 通法，尚未成为正式方法卡', evidence }, similar: similarMethods(content, await this.methods(false)), requiresLimitationsReview: !source.review!.quality.limitations.length };
  }
  async merge(sourceId: string, targetId: string, raw: unknown) {
    const input = z.object({ operationId: z.string().uuid(), sourceRevision: z.number().int().positive(), targetRevision: z.number().int().positive() }).strict().parse(raw);
    if (sourceId === targetId) throw new GraphError('不能合并到自身。');
    const source = await this.row('math_methods', sourceId), target = await this.row('math_methods', targetId);
    if (source.operation_id === input.operationId && source.merged_into === targetId) return this.getMethod(targetId);
    if (source.scope_id !== target.scope_id || source.merged_into || target.merged_into || source.status !== 'approved' || target.status !== 'approved') throw new GraphError('仅可合并同一范围内已审核且未合并的方法。');
    if (await this.db.prepare('SELECT id FROM math_methods WHERE merged_into=?').bind(sourceId).first()) throw new GraphError('此方法已有合并来源，请将其他重复方法合并到此卡，避免产生多层别名。');
    if (!await this.validSource(parse(source.source)) || !await this.validSource(parse(target.source))) throw new GraphError('来源已失效，请先核查。', 422);
    if (source.revision !== input.sourceRevision || target.revision !== input.targetRevision) throw new GraphError('方法版本已更新。', 409);
    const now = new Date().toISOString();
    await this.db.batch([this.lock(input.operationId), this.db.prepare(`UPDATE math_methods SET merged_into=?,revision=revision+1,operation_id=?,reviewer=?,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND merged_into IS NULL AND NOT EXISTS(SELECT 1 FROM math_methods WHERE merged_into=?) AND EXISTS(SELECT 1 FROM math_methods WHERE id=? AND owner_id=? AND revision=? AND merged_into IS NULL AND status='approved')`).bind(targetId, input.operationId, this.owner, now, sourceId, this.owner, input.sourceRevision, sourceId, targetId, this.owner, input.targetRevision), this.methodVersion(sourceId, input.operationId, now)]);
    if ((await this.row('math_methods', sourceId)).operation_id !== input.operationId) throw new GraphError('并发合并冲突，未修改关联。', 409);
    // Relations keep their original method IDs; reads resolve the alias. All evidence and reviews survive.
    return this.getMethod(targetId);
  }
}

import { analysisFromClassification, normalizeKnowledgeName } from './analysis';

export class CatalogError extends Error { constructor(message: string, public status = 400) { super(message); } }
type NodeRow = { id: string; code: string; name: string; level: number; subject: string; stage: string; curriculum_version: string; description: string; metadata: string; source: string; knowledge_review_status: string; updated_at: string };
type QuestionRow = { id: string; scope_id: string; current_revision_id: string; education_stage: string | null; payload: string; source_id?: string; source_classification?: string };
type Role = 'main' | 'secondary' | 'exam_point' | 'question_type';
type Plan = { node: NodeRow; role: Role; weight: number; parentId?: string; created: boolean };
const chapterCodes: Record<string, string> = {
  'HS-SETS-LOGIC': 'SETS', 'HS-FUNCTION': 'FUNC', 'HS-ELEMENTARY-FUNCTION': 'FUNC',
  'HS-TRIG-FUNCTION': 'TRIG', 'HS-SEQUENCE': 'SEQ', 'HS-VECTOR-TRIANGLE': 'VECTOR',
  'HS-INEQUALITY': 'INEQ', 'HS-SOLID-GEOMETRY': 'SOLID', 'HS-SPACE-VECTOR': 'SOLID',
  'HS-ANALYTIC-GEOMETRY': 'ANALYTIC', 'HS-PROBABILITY': 'PROB', 'HS-STATISTICS': 'PROB',
  'HS-COUNTING-RANDOM': 'PROB', 'HS-DERIVATIVE': 'DERIV', 'HS-COMPLEX': 'COMPLEX',
};
// Curated synonyms only. No fuzzy substring matches or automatic semantic guesses.
const aliases: Record<string, string> = {
  '函数单调性': 'FUNC.MONOTONE', '函数奇偶性': 'FUNC.PARITY', '二次函数的图象与性质': 'FUNC.QUADRATIC',
  '函数的奇偶性': 'FUNC.PARITY', '函数的周期性': 'FUNC.PERIOD', '函数的值域': 'FUNC.RANGE',
  '函数的概念与表示': 'FUNC.CONCEPT', '导数与单调性': 'DERIV.MONOTONE', '导数单调性': 'DERIV.MONOTONE',
  '导数与函数的单调性': 'DERIV.MONOTONE', '导数与函数极值': 'DERIV.EXTREMA',
  '导数的计算': 'DERIV.RULE', '基本不等式': 'INEQ.BASIC', '平面向量数量积': 'VECTOR.DOT',
  '等差数列的通项公式': 'SEQ.ARITHMETIC', '等比数列的通项公式': 'SEQ.GEOMETRIC',
  '椭圆的标准方程与性质': 'ANALYTIC.ELLIPSE', '双曲线的标准方程与性质': 'ANALYTIC.HYPERBOLA',
};
async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
const fields = 'n.id,n.code,n.name,n.level,n.subject,n.stage,n.curriculum_version,n.description,n.metadata,n.source,n.knowledge_review_status,n.updated_at';

export class KnowledgeAttachmentStore {
  constructor(readonly db: D1Database, readonly actor: string, readonly scopes: string[], readonly curator = false) {}
  private placeholders() { if (!this.scopes.length) throw new CatalogError('无权访问题库。', 403); return this.scopes.map(() => '?').join(','); }
  private visible(alias = 'n') { return `(${alias}.source='seed' OR json_extract(${alias}.metadata,'$.scope_id') IN (${this.placeholders()}))`; }
  private async question(id: string, revisionId?: string) {
    const row = await this.db.prepare(`SELECT c.id,c.scope_id,c.current_revision_id,r.education_stage,r.payload FROM canonical_questions c
      JOIN canonical_question_revisions r ON r.id=c.current_revision_id AND r.canonical_question_id=c.id
      WHERE c.id=? AND c.scope_id IN (${this.placeholders()}) AND c.subject='math' AND c.status='active'
      AND NOT EXISTS(SELECT 1 FROM math_library_trash t WHERE t.canonical_question_id=c.id)`)
      .bind(id, ...this.scopes).first<QuestionRow>();
    if (!row) throw new CatalogError('题目不存在或无权访问。', 404);
    if (revisionId && row.current_revision_id !== revisionId) throw new CatalogError('题目版本已变化，请刷新后重试。', 409);
    const source = await this.db.prepare(`SELECT p.id,p.classification FROM question_module_links l
      JOIN question_occurrences o ON o.id=l.occurrence_id AND o.canonical_question_id=l.canonical_question_id
      JOIN paper_questions p ON p.id=l.legacy_paper_question_id
      JOIN canonical_question_revisions r ON r.id=o.content_revision_id
      WHERE l.canonical_question_id=? AND l.module_type='paper_question' AND o.content_revision_id=? AND o.mapping_status='confirmed'
      AND p.question_text=r.original_text AND p.classification IS NOT NULL ORDER BY p.updated_at DESC,p.id LIMIT 1`).bind(id, row.current_revision_id).first<{ id: string; classification: string }>();
    if (source) { row.source_id = source.id; row.source_classification = source.classification; }
    return row;
  }
  private guard(question: QuestionRow) {
    // Intentional CHECK failure aborts the entire D1 batch if the source changes mid-operation.
    return this.db.prepare(`INSERT INTO knowledge_nodes(id,code,name,level) SELECT ?,?,'guard',0 WHERE NOT EXISTS(
      SELECT 1 FROM canonical_questions c JOIN canonical_question_revisions r ON r.id=c.current_revision_id
      WHERE c.id=? AND c.scope_id=? AND c.status='active' AND c.current_revision_id=? AND r.payload=?
      AND NOT EXISTS(SELECT 1 FROM math_library_trash t WHERE t.canonical_question_id=c.id)
      AND (? IS NULL OR EXISTS(SELECT 1 FROM paper_questions p JOIN question_module_links l ON l.legacy_paper_question_id=p.id
        JOIN question_occurrences o ON o.id=l.occurrence_id WHERE p.id=? AND p.classification=? AND p.question_text=r.original_text
        AND l.canonical_question_id=c.id AND o.content_revision_id=r.id AND o.mapping_status='confirmed')))`)
      .bind(`guard:${crypto.randomUUID()}`, `guard:${crypto.randomUUID()}`, question.id, question.scope_id, question.current_revision_id, question.payload, question.source_id ?? null, question.source_id ?? null, question.source_classification ?? null);
  }

  async attach(questionId: string, revisionId?: string) {
    const q = await this.question(questionId, revisionId);
    const classification = q.source_classification ? JSON.parse(q.source_classification) : JSON.parse(q.payload).classification;
    const analysis = analysisFromClassification(classification);
    if (!analysis || (q.education_stage && q.education_stage !== '高中')) return { status: 'skipped', message: '当前题目没有有效的高中知识分析，已保留原数据。' };
    const setup = await this.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('knowledge_nodes','knowledge_edges','question_knowledge_relation','knowledge_relation_evidence')").first<{ n: number }>();
    if (setup?.n !== 4) throw new CatalogError('请先完成知识库数据库迁移。', 503);
    const nodes = (await this.db.prepare(`SELECT ${fields} FROM knowledge_nodes n WHERE n.subject='math' AND n.stage='senior_high' AND n.curriculum_version='general-v1' AND ${this.visible()}`).bind(...this.scopes).all<NodeRow>()).results;
    if (!nodes.some(n => n.source === 'seed' && n.code === 'HS')) throw new CatalogError('请先导入 Phase 2 高中知识库。', 503);
    const edges = (await this.db.prepare("SELECT source_id,target_id FROM knowledge_edges WHERE relation_type='belongs_to'").all<{ source_id: string; target_id: string }>()).results;
    const parent = new Map(edges.map(e => [e.source_id, e.target_id]));
    const plans: Plan[] = [];
    const now = new Date().toISOString();
    const resolve = async (name: string, level: number, role: Role, weight: number, parentId?: string) => {
      const normalized = normalizeKnowledgeName(name);
      const canonicalCode = aliases[name];
      const matches = nodes.filter(n => n.level === level && (normalizeKnowledgeName(n.name) === normalized || n.code === name || n.code === canonicalCode)
        && (!parentId || parent.get(n.id) === parentId)
        && (n.source === 'seed' || JSON.parse(n.metadata).scope_id === q.scope_id));
      // Ambiguous names never silently select the first record.
      if (matches.length === 1) {
        const item = { node: matches[0], role, weight, created: false };
        plans.push(item); return item.node;
      }
      const hash = await digest(JSON.stringify([q.scope_id, level, parentId ?? '', normalized]));
      const id = `kg:candidate:${hash}`;
      const existing = nodes.find(n => n.id === id);
      const node: NodeRow = existing ?? { id, code: `CANDIDATE.${hash}`, name, level, subject: 'math', stage: 'senior_high', curriculum_version: 'general-v1',
        description: 'AI 提出的知识标签，尚待教师核对概念、名称和层级。', source: 'ai', knowledge_review_status: 'pending', updated_at: now,
        metadata: JSON.stringify({ scope_id: q.scope_id, proposed_parent_id: parentId ?? null, ambiguous: matches.length > 1 }) };
      if (!existing) { nodes.push(node); if (parentId) parent.set(id, parentId); }
      plans.push({ node, role, weight, parentId, created: !existing }); return node;
    };
    const secondary = [...new Map(analysis.secondary_knowledge.filter(n => normalizeKnowledgeName(n) !== normalizeKnowledgeName(analysis.main_knowledge)).map(n => [normalizeKnowledgeName(n), n])).values()];
    const chapter = nodes.find(n => n.source === 'seed' && n.code === chapterCodes[classification.chapter?.code]);
    // Known concepts can belong to another chapter (for example solving triangles).
    const main = await resolve(analysis.main_knowledge, 3, 'main', secondary.length ? 0.6 : 1);
    const mainPlan = plans[0];
    if (mainPlan.created && chapter) mainPlan.parentId = chapter.id;
    for (const name of secondary) await resolve(name, 3, 'secondary', 0.4 / secondary.length);
    const exam = analysis.exam_point ? await resolve(analysis.exam_point, 4, 'exam_point', 1, main.id) : null;
    if (analysis.question_type) await resolve(analysis.question_type, 5, 'question_type', 1, exam?.id);
    const analysisHash = await digest(JSON.stringify(analysis));
    const statements = [this.guard(q)];
    // Rebuild only unreviewed AI links; never overwrite a teacher decision for the same revision.
    statements.push(this.db.prepare("DELETE FROM question_knowledge_relation WHERE question_id=? AND source='ai' AND knowledge_review_status='pending'").bind(q.id));
    const unique = [...new Map(plans.slice().reverse().map(p => [p.node.id, p])).values()];
    const distinctSecondary = unique.filter(p => p.role === 'secondary');
    for (const p of unique) {
      if (p.role === 'main') p.weight = distinctSecondary.length ? 0.6 : 1;
      if (p.role === 'secondary') p.weight = 0.4 / distinctSecondary.length;
    }
    for (const p of unique) {
      const n = p.node;
      if (p.created) statements.push(this.db.prepare(`INSERT INTO knowledge_nodes(id,code,name,subject,stage,curriculum_version,level,description,metadata,source,knowledge_review_status,created_at,updated_at)
        VALUES(?,?,?,'math','senior_high','general-v1',?,?,?,'ai','pending',?,?) ON CONFLICT(id) DO NOTHING`).bind(n.id, n.code, n.name, n.level, n.description, n.metadata, now, now));
    }
    for (const p of unique) {
      if (p.created && p.parentId) statements.push(this.db.prepare(`INSERT INTO knowledge_edges(id,source_id,target_id,relation_type,description,source,knowledge_review_status)
        VALUES(?,?,?,'belongs_to','AI 建议层级，待审核','ai','pending') ON CONFLICT(source_id,target_id,relation_type) DO NOTHING`).bind(`kg:candidate-edge:${p.node.id}`, p.node.id, p.parentId));
      statements.push(this.db.prepare(`INSERT INTO question_knowledge_relation(question_id,knowledge_id,scope_id,weight,role,source,knowledge_review_status,updated_at)
        VALUES(?,?,?,?,?,'ai','pending',?) ON CONFLICT(question_id,knowledge_id) DO UPDATE SET weight=excluded.weight,role=excluded.role,knowledge_review_status='pending',reviewed_by=NULL,reviewed_at=NULL,updated_at=excluded.updated_at
        WHERE question_knowledge_relation.source='ai' AND NOT EXISTS(SELECT 1 FROM knowledge_relation_evidence e WHERE e.question_id=excluded.question_id AND e.knowledge_id=excluded.knowledge_id AND e.revision_id=?)`)
        .bind(q.id, p.node.id, q.scope_id, p.weight, p.role, now, q.current_revision_id));
      statements.push(this.db.prepare(`INSERT INTO knowledge_relation_evidence(question_id,knowledge_id,revision_id,analysis_hash) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM question_knowledge_relation r WHERE r.question_id=? AND r.knowledge_id=? AND r.source='ai' AND r.knowledge_review_status='pending')
        ON CONFLICT(question_id,knowledge_id) DO UPDATE SET revision_id=excluded.revision_id,analysis_hash=excluded.analysis_hash,created_at=CURRENT_TIMESTAMP`)
        .bind(q.id, p.node.id, q.current_revision_id, analysisHash, q.id, p.node.id));
    }
    try { await this.db.batch(statements); } catch { throw new CatalogError('挂载未完成，题目可能已变化；原关联已保留，请刷新重试。', 409); }
    return { status: 'attached', questionId, revisionId: q.current_revision_id, matched: unique.filter(p => !p.created).length, proposed: unique.filter(p => p.created).length, relations: unique.length, knowledge_review_status: 'pending' };
  }

  async list(includePending = false) {
    const nodes = (await this.db.prepare(`SELECT ${fields},n.difficulty,n.importance,n.exam_frequency,
      (SELECT count(DISTINCT r.question_id) FROM question_knowledge_relation r
       JOIN knowledge_relation_evidence v ON v.question_id=r.question_id AND v.knowledge_id=r.knowledge_id
       JOIN canonical_questions c ON c.id=r.question_id AND c.current_revision_id=v.revision_id
       WHERE r.knowledge_id=n.id AND r.scope_id IN (${this.placeholders()}) AND r.knowledge_review_status='approved' AND n.knowledge_review_status='approved' AND c.status='active'
       AND NOT EXISTS(SELECT 1 FROM math_library_trash t WHERE t.canonical_question_id=c.id)) AS question_count
      FROM knowledge_nodes n WHERE n.subject='math' AND n.stage='senior_high' AND n.curriculum_version='general-v1' AND ${this.visible()}
      ${includePending ? '' : "AND n.knowledge_review_status='approved'"} ORDER BY n.level,n.code`).bind(...this.scopes, ...this.scopes).all<NodeRow & { question_count: number }>()).results;
    const visible = new Set(nodes.map(n => n.id));
    const edges = (await this.db.prepare(`SELECT id,source_id,target_id,relation_type,knowledge_review_status,updated_at FROM knowledge_edges ${includePending ? '' : "WHERE knowledge_review_status='approved'"}`).all<{ id: string; source_id: string; target_id: string }>()).results.filter(e => visible.has(e.source_id) && visible.has(e.target_id));
    return { nodes: nodes.map(n => { const { metadata, ...publicNode } = n; void metadata; return publicNode; }), edges };
  }

  async questionLinks(id: string) {
    const q = await this.question(id);
    return (await this.db.prepare(`SELECT r.*,n.name,n.level,n.knowledge_review_status AS node_review_status,e.revision_id,
      CASE WHEN e.revision_id=? THEN 0 ELSE 1 END AS stale FROM question_knowledge_relation r JOIN knowledge_nodes n ON n.id=r.knowledge_id
      LEFT JOIN knowledge_relation_evidence e ON e.question_id=r.question_id AND e.knowledge_id=r.knowledge_id
      WHERE r.question_id=? AND r.scope_id=? AND ${this.visible()} ORDER BY n.level,n.name`).bind(q.current_revision_id, id, q.scope_id, ...this.scopes).all()).results;
  }

  async reviewNode(id: string, expectedUpdatedAt: string, parentId?: string) {
    const n = await this.db.prepare(`SELECT ${fields} FROM knowledge_nodes n WHERE n.id=? AND ${this.visible()}`).bind(id, ...this.scopes).first<NodeRow>();
    if (!n) throw new CatalogError('节点不存在或无权访问。', 404);
    if (n.source === 'seed' && !this.curator) throw new CatalogError('共享知识库须由项目维护者审核。', 403);
    if (n.updated_at !== expectedUpdatedAt || n.knowledge_review_status !== 'pending') throw new CatalogError('节点已变化，请刷新后审核。', 409);
    let parents = (await this.db.prepare("SELECT p.id,p.level,p.knowledge_review_status FROM knowledge_edges e JOIN knowledge_nodes p ON p.id=e.target_id WHERE e.source_id=? AND e.relation_type='belongs_to'").bind(id).all<{ id: string; level: number; knowledge_review_status: string }>()).results;
    if (parentId) {
      const proposed = await this.db.prepare(`SELECT ${fields} FROM knowledge_nodes n WHERE n.id=? AND ${this.visible()}`).bind(parentId, ...this.scopes).first<NodeRow>();
      if (!proposed || proposed.subject !== n.subject || proposed.stage !== n.stage || proposed.curriculum_version !== n.curriculum_version || proposed.level !== n.level - 1) throw new CatalogError('上级节点不符合学段、课程版本或层级要求。');
      // A private candidate cannot be placed beneath another private scope's node.
      if (proposed.source !== 'seed' && JSON.parse(proposed.metadata).scope_id !== JSON.parse(n.metadata).scope_id) throw new CatalogError('不能跨私有题库设置上级节点。', 403);
      parents = [proposed];
    }
    if (n.level > 1 && (parents.length !== 1 || parents[0].level !== n.level - 1 || parents[0].knowledge_review_status !== 'approved')) throw new CatalogError('请先补齐并审核唯一的上级节点。', 409);
    const now = new Date().toISOString();
    const guard = this.db.prepare(`INSERT INTO knowledge_nodes(id,code,name,level) SELECT ?,?,'guard',0 WHERE NOT EXISTS(SELECT 1 FROM knowledge_nodes WHERE id=? AND updated_at=? AND knowledge_review_status='pending')`).bind(`guard:${crypto.randomUUID()}`, `guard:${crypto.randomUUID()}`, id, expectedUpdatedAt);
    const statements = [guard];
    if (parents[0]) statements.push(this.db.prepare(`INSERT INTO knowledge_nodes(id,code,name,level) SELECT ?,?,'guard',0 WHERE NOT EXISTS(SELECT 1 FROM knowledge_nodes WHERE id=? AND knowledge_review_status='approved')`).bind(`guard:${crypto.randomUUID()}`, `guard:${crypto.randomUUID()}`, parents[0].id));
    statements.push(this.db.prepare("UPDATE knowledge_nodes SET knowledge_review_status='approved',reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=?").bind(this.actor, now, now, id));
    if (parentId) {
      statements.push(this.db.prepare("DELETE FROM knowledge_edges WHERE source_id=? AND relation_type='belongs_to'").bind(id));
      statements.push(this.db.prepare("INSERT INTO knowledge_edges(id,source_id,target_id,relation_type,source) VALUES(?,?,?,'belongs_to','manual')").bind(`kg:review-parent:${id}`, id, parentId));
    }
    statements.push(this.db.prepare("UPDATE knowledge_edges SET knowledge_review_status='approved',reviewed_by=?,reviewed_at=?,updated_at=? WHERE source_id=? AND relation_type='belongs_to'").bind(this.actor, now, now, id));
    try { await this.db.batch(statements); } catch { throw new CatalogError('审核期间节点已变化，请刷新重试。', 409); }
    return { id, knowledge_review_status: 'approved' };
  }

  async reviewLink(questionId: string, knowledgeId: string, revisionId: string, expectedUpdatedAt: string) {
    const q = await this.question(questionId, revisionId);
    const now = new Date().toISOString();
    const guard = this.db.prepare(`INSERT INTO knowledge_nodes(id,code,name,level) SELECT ?,?,'guard',0 WHERE NOT EXISTS(
      SELECT 1 FROM question_knowledge_relation r JOIN knowledge_relation_evidence e ON e.question_id=r.question_id AND e.knowledge_id=r.knowledge_id
      JOIN knowledge_nodes n ON n.id=r.knowledge_id WHERE r.question_id=? AND r.knowledge_id=? AND r.scope_id=? AND r.updated_at=? AND e.revision_id=?
      AND r.knowledge_review_status='pending' AND n.knowledge_review_status='approved' AND ${this.visible()})`)
      .bind(`guard:${crypto.randomUUID()}`, `guard:${crypto.randomUUID()}`, q.id, knowledgeId, q.scope_id, expectedUpdatedAt, revisionId, ...this.scopes);
    try { await this.db.batch([this.guard(q), guard, this.db.prepare("UPDATE question_knowledge_relation SET knowledge_review_status='approved',reviewed_by=?,reviewed_at=?,updated_at=? WHERE question_id=? AND knowledge_id=?").bind(this.actor, now, now, q.id, knowledgeId)]); }
    catch { throw new CatalogError('请先审核知识节点，或刷新已变化的题目关联。', 409); }
    return { questionId, knowledgeId, knowledge_review_status: 'approved' };
  }

  async reviewEdge(id: string, expectedUpdatedAt: string) {
    const edge = await this.db.prepare(`SELECT e.* FROM knowledge_edges e JOIN knowledge_nodes n ON n.id=e.source_id JOIN knowledge_nodes t ON t.id=e.target_id
      WHERE e.id=? AND ${this.visible('n')} AND ${this.visible('t')}`).bind(id, ...this.scopes, ...this.scopes)
      .first<{ source: string; relation_type: string }>();
    if (!edge) throw new CatalogError('关系不存在或无权访问。', 404);
    if (edge.source === 'seed' && !this.curator) throw new CatalogError('共享知识关系须由项目维护者审核。', 403);
    if (!['prerequisite', 'related', 'advanced'].includes(edge.relation_type)) throw new CatalogError('层级关系请随子节点审核。');
    const now = new Date().toISOString();
    const guard = this.db.prepare(`INSERT INTO knowledge_nodes(id,code,name,level) SELECT ?,?,'guard',0 WHERE NOT EXISTS(
      SELECT 1 FROM knowledge_edges e JOIN knowledge_nodes n ON n.id=e.source_id JOIN knowledge_nodes t ON t.id=e.target_id
      WHERE e.id=? AND e.updated_at=? AND e.knowledge_review_status='pending' AND n.knowledge_review_status='approved' AND t.knowledge_review_status='approved'
      AND n.id<>t.id AND n.subject=t.subject AND n.stage=t.stage AND n.curriculum_version=t.curriculum_version
      AND ${this.visible('n')} AND ${this.visible('t')})`).bind(`guard:${crypto.randomUUID()}`, `guard:${crypto.randomUUID()}`, id, expectedUpdatedAt, ...this.scopes, ...this.scopes);
    try { await this.db.batch([guard, this.db.prepare("UPDATE knowledge_edges SET knowledge_review_status='approved',reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=?").bind(this.actor, now, now, id)]); }
    catch { throw new CatalogError('请先审核两端节点，或刷新已变化的关系。', 409); }
    return { id, knowledge_review_status: 'approved' };
  }
}

/** Import hooks are non-fatal: a missing migration never turns a successful upload into a failure. */
export async function tryAttachKnowledge(db: D1Database, actor: string, scopes: string[], canonicalId: string) {
  try { return await new KnowledgeAttachmentStore(db, actor, scopes).attach(canonicalId); }
  catch (error) {
    console.warn('[knowledge-catalog] attachment deferred', { status: error instanceof CatalogError ? error.status : 503 });
    return { status: 'deferred', message: '题目已保存；知识挂载待重试，请检查知识库初始化状态。' };
  }
}

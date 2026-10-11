import type { KnowledgeGraphStore } from './knowledge-graph-store';
import { seniorTaxonomy } from './senior-taxonomy';
import type { MethodContent } from './knowledge-graph';

const base = (name: string, summary: string, conditions: string[], steps: string[], limitations: string[], mistakes: string[]): MethodContent => ({ name, summary, conditions, steps, limitations, mistakes, typicalProblems: ['导数与单调性专题'], variants: [] });
export const pilotMethods = [
  base('导数符号表法', '通过导数的符号研究函数在各区间的单调性。', ['函数在所讨论开区间可导，先明确其定义域。'], ['求定义域和导数', '求导数零点并标出不可导点及定义域断点', '分区间判断导数符号', '分别写出单调区间并处理端点'], ['不能跨越定义域断点合并区间；导数为零的孤立点本身不能判断极值。'], ['忽略定义域', '只解导数等于零，没有验证两侧符号']),
  base('参数分类讨论法', '按参数导致的导数符号和根的位置变化分类。', ['已明确参数范围与函数定义域；能确定导数关键点的位置。'], ['求导并分析导数结构', '确定参数临界值', '分别讨论根的位置和符号', '检查边界参数并汇总结论'], ['分类须覆盖全部参数且互不遗漏；判别式不是根落在指定区间的充分条件。'], ['遗漏重根情况', '忽略导数根与定义域边界的相对位置']),
  base('参数分离法', '在合法等价变形条件下将参数问题转为辅助函数的值域或最值问题。', ['变形过程中分母不为零；乘除因子的符号已知；参数和自变量范围明确。'], ['分析参数与变量的位置', '判断能否合法分离', '构造辅助函数', '研究值域、最值或相应性质', '转回原题并处理边界'], ['须检查分母零点、变形符号和等价性；仅有上确界时要判断等号能否取得。'], ['直接除以符号未知的式子', '把不能取得的界当成最值']),
  base('构造辅助函数法', '将待证不等式或比较问题转为函数符号与单调性研究。', ['辅助函数与原问题有明确等价或充分关系；可在目标区间进行求导分析。'], ['整理目标式并构造函数', '明确定义域与目标符号', '利用导数研究单调性', '寻找基准点或最值', '返回原命题并检查等号'], ['辅助函数的正负结论须覆盖原问题区间；不能只用图形直观替代证明。'], ['忘记原式的取值范围', '求导后没有返回原问题']),
  base('二次求导分析法', '先研究导函数的变化，再研究原函数的单调区间。', ['函数在目标区间二次可导；一阶导数符号不易直接确定。'], ['求一阶和二阶导数', '分析一阶导数的单调性与极值', '确定一阶导数零点与符号', '推回原函数的单调性'], ['二阶导数符号决定一阶导数的变化，不直接决定原函数增减。'], ['将二阶导数大于零直接当成原函数递增']),
];
export const pilotEdges = [
  ['HS-FUNC-DOMAIN', 'HS-DERIVATIVE-MONOTONICITY', 'prerequisite'],
  ['HS-FUNC-MONOTONICITY', 'HS-DERIVATIVE-MONOTONICITY', 'prerequisite'],
  ['HS-DERIVATIVE-CALC', 'HS-DERIVATIVE-MONOTONICITY', 'prerequisite'],
  ['HS-DERIVATIVE-MONOTONICITY', 'HS-DERIVATIVE-EXTREMUM', 'prerequisite'],
  ['HS-DERIVATIVE-MONOTONICITY', 'HS-DERIVATIVE-PARAMETER', 'prerequisite'],
  ['HS-DERIVATIVE-MONOTONICITY', 'HS-DERIVATIVE-INEQUALITY', 'related'],
] as const;
// Explicit teacher action, not a migration side effect. Reuse existing stable codes.
export async function initializePilot(store: KnowledgeGraphStore, scopeId: string) {
  if (!store.scopes.includes(scopeId)) throw Error('无权初始化此范围。');
  const wanted = new Set(['HS-FUNC-DOMAIN', 'HS-FUNC-MONOTONICITY', ...seniorTaxonomy.filter(k => k[2] === 'HS-DERIVATIVE').map(k => k[0])]);
  await store.db.batch(seniorTaxonomy.filter(k => wanted.has(k[0])).map(([code, name, chapter]) => store.db.prepare('INSERT INTO knowledge_points(code,name,chapter_code) VALUES(?,?,?) ON CONFLICT(code) DO NOTHING').bind(code, name, chapter)));
  const kp = (await store.db.prepare(`SELECT id,code FROM knowledge_points WHERE code IN (${[...wanted].map(() => '?')})`).bind(...wanted).all<{ id: number; code: string }>()).results;
  const ids = new Map(kp.map(k => [k.code, k.id]));
  const existing = await store.relations(false, scopeId);
  let createdMethods = 0, createdRelations = 0;
  for (const [from, to, type] of pilotEdges) {
    if (existing.some(r => r.type === type && r.from_knowledge === ids.get(from) && r.to_knowledge === ids.get(to))) continue;
    await store.writeRelation(crypto.randomUUID(), { operationId: crypto.randomUUID(), expectedRevision: 0, scopeId, status: 'candidate', type, fromKnowledge: ids.get(from)!, toKnowledge: ids.get(to)!, methodId: null, canonicalId: null, revisionId: null, source: { origin: 'pilot', note: '5C 人工编写教学骨架，待教师审核', evidence: null } }); createdRelations++;
  }
  for (const [index, content] of pilotMethods.entries()) {
    // The explicit seed marker, not the method name, identifies repeat initialization.
    const note = `5C-pilot-v1:${index} 人工编写示例，未宣称来自真实解析`;
    const seedKey = `derivative-method-v1:${index}`;
    const seeded = await store.db.prepare("SELECT id FROM math_methods WHERE owner_id=? AND scope_id=? AND json_extract(source,'$.origin')='pilot' AND (json_extract(source,'$.seedKey')=? OR json_extract(source,'$.note')=?) LIMIT 1").bind(store.owner, scopeId, seedKey, note).first<{ id: string }>();
    let method = seeded ? await store.getMethod(seeded.id) : null;
    if (!method) { method = await store.writeMethod(crypto.randomUUID(), { operationId: crypto.randomUUID(), expectedRevision: 0, scopeId, status: 'candidate', content, source: { origin: 'pilot', note: '人工编写专题示例，待教师审核；未宣称来自真实解析', evidence: null, seedKey } }); createdMethods++; }
    else if (!method.source.seedKey && !method.merged_into) {
      // Upgrade only seed provenance metadata, preserving any edited content and decision.
      method = await store.writeMethod(method.id, { operationId: crypto.randomUUID(), expectedRevision: method.revision, scopeId, status: method.status, content: method.content, source: { ...method.source, seedKey } });
    }
    if (method.merged_into) continue;
    const code = index === 1 || index === 2 ? 'HS-DERIVATIVE-PARAMETER' : index === 3 ? 'HS-DERIVATIVE-INEQUALITY' : 'HS-DERIVATIVE-MONOTONICITY';
    if (!existing.some(r => r.type === 'applies' && r.method_id === method!.id && r.to_knowledge === ids.get(code))) {
      await store.writeRelation(crypto.randomUUID(), { operationId: crypto.randomUUID(), expectedRevision: 0, scopeId, status: 'candidate', type: 'applies', fromKnowledge: null, toKnowledge: ids.get(code)!, methodId: method.id, canonicalId: null, revisionId: null, source: { origin: 'pilot', note: '专题方法适用建议，待教师审核', evidence: null } }); createdRelations++;
    }
  }
  return { createdMethods, createdRelations, knowledge: kp.length, message: '骨架已保存为候选，请教师逐项审核；真实题目沿用现有分类，未自动新增题目方法关系。' };
}

import { z } from 'zod';
import type { GraphMethod } from './knowledge-graph';
import { hasUnreadableQuestionText } from './question-text-quality';

const unknown = 'unknown';
export const decisionFactsSchema = z.object({
  domain: z.enum(['checked', 'unknown']).default(unknown),
  degeneration: z.enum(['checked', 'unknown']).default(unknown),
  separable: z.enum(['yes', 'no', 'unknown']).default(unknown),
  divisor: z.enum(['positive', 'negative', 'changes', 'zero', 'unknown']).default(unknown),
  quantifier: z.enum(['all', 'exists', 'unknown']).default(unknown),
  bound: z.enum(['upper', 'lower', 'unknown']).default(unknown),
  objective: z.enum(['maximum', 'minimum', 'range', 'unknown']).default(unknown),
  positive: z.enum(['yes', 'no', 'unknown']).default(unknown),
  equality: z.enum(['reachable', 'unreachable', 'unknown']).default(unknown),
  structure: z.enum(['fixedSum', 'fixedProduct', 'reciprocal', 'square', 'derivative', 'unknown']).default(unknown),
}).strict();
export type DecisionFacts = z.infer<typeof decisionFactsSchema>;
export type StrategyDecision = ReturnType<typeof decideStrategies>;

/** No model calls or symbolic claims: the stem supplies recall cues; teachers supply verified facts. */
export function decideStrategies(question: string, methods: GraphMethod[], rawFacts: unknown = {}) {
  const facts = decisionFactsSchema.parse(rawFacts), text = question.normalize('NFKC');
  const parameter = /含参|参数|恒成立|任意|对所有|存在|最佳常数|实根|零点/.test(text);
  const inequality = /不等式|最[大小]值|正数|正实数|[xyab]\s*>\s*0|\\(?:frac|dfrac)|倒数/.test(text);
  const trace: string[] = [], checks = new Set<string>(), risks: string[] = [];
  const choices = new Map<string, { score: number; reason: string; eligible: boolean }>();
  const add = (key: string, score: number, reason: string, eligible = false) => { if ((choices.get(key)?.score || 0) < score) choices.set(key, { score, reason, eligible }); };
  checks.add('逐项保留原定义域、分母非零、根式和对数限制；结论分别核对必要性与充分性。');
  if (parameter) {
    trace.push(facts.objective==='maximum'?'目标：最大参数；可行集必须确有最大元，不能只给上确界。':facts.objective==='minimum'?'目标：最小参数；可行集必须确有最小元，不能只给下确界。':facts.objective==='range'?'目标：求完整参数范围，合并所有限制并核对端点。':'参数目标尚未确认：最大值、最小值与完整范围需区分。');
    trace.push(facts.domain === 'checked' ? '教师已检查定义域。' : '定义域尚未确认，先检查定义域，不进行无条件参数分离。');
    trace.push(facts.degeneration === 'checked' ? '教师已处理次数退化与零系数。' : '先单列最高次项系数为零、分母为零等退化情形。');
    add('p-domain-degree', 90, '含参条件可能改变合法域或方程次数。');
    if (/恒成立|最佳常数/.test(text)) {
      add('p-equality-parameter', 83, '可先试合法的等号点反推必要参数，再用课内依据证明充分性。');
    }
    const ready = facts.domain === 'checked' && facts.degeneration === 'checked';
    if (facts.separable === 'yes' && ['positive', 'negative'].includes(facts.divisor)) {
      trace.push(facts.divisor === 'negative' ? '除数为负，分离参数时反转不等号。' : '除数为正，分离参数时保持不等号。');
      add('p-separation-sign', 100, '教师确认可等价分离且除数定号，优先将参数转为常数界。', ready);
      if (facts.quantifier === 'all' && facts.bound !== 'unknown') {
        trace.push(facts.bound === 'upper' ? '全称约束 a≤g(x)：取 inf g 作为所有限制的交集。' : '全称约束 a≥g(x)：取 sup g 作为所有限制的交集。');
        const compatible = facts.objective === 'range' || (facts.objective === 'maximum' && facts.bound === 'upper') || (facts.objective === 'minimum' && facts.bound === 'lower');
        add('p-worst-constant', 105, '全称条件由最紧约束决定；先试基本不等式或配方，再考虑导数。', ready && compatible);
        if (!compatible) checks.add('当前分离方向未必给出所求参数最值；先求可行集，再判断最大或最小参数是否存在。');
      } else if (facts.quantifier === 'exists') {
        trace.push('存在条件取各点可行参数的并集；不要使用全称问题的 inf/sup 方向。');
        risks.push('存在 a≤g(x) 关注 sup g，存在 a≥g(x) 关注 inf g；界是否取到仍决定端点。');
      } else checks.add('确认量词，以及分离后 a≤g(x) 还是 a≥g(x)。');
    } else if (['changes', 'zero'].includes(facts.divisor)) {
      trace.push('除数变号或可能为零：分区并回原式核对零点，暂不能整体分离。');
      risks.push('整体除以变号或为零的因子会丢解或反转方向。');
      add('p-separation-sign', 99, '先做符号分区和零点检查，此时不能直接整体分离。');
    } else {
      trace.push(facts.separable === 'no' ? '不能直接分离，尝试配方、图像或导数的临界机制。' : '可分离性及除数符号待教师确认。');
      add('p-separation-sign', 75, '这是需要核验的路径；题干关键词不能证明分离合法。');
    }
    checks.add('对严格不等式单独核对最紧界能否取得；候选临界值必须代回原式。');
  }
  if (/二次|判别式|x(?:\^\{?2\}?|²)/.test(question)) add('p-coefficient-delta', 85, '只有确认二次项非零后才能使用判别式；二次外的函数另选机制。');
  if (/实根|零点/.test(text) && /区间|之间/.test(text)) add('p-root-interval', 95, '区间内的根须结合连续性、单调性与端点；二次式再用顶点及对称轴。');
  if (/端点|开区间|闭区间|\[[^\]]*,/.test(text)) add('p-endpoint-collision', 80, '端点开闭可能改变临界参数的保留情况。');
  if (/导数|极值|单调|f[′']/.test(text)) { add('p-derivative-order', 80, '含参驻点的先后顺序需分段验证。'); add('p-stationary-domain', 82, '只保留定义域内的驻点，并与端点比较。'); }
  if (/零点个数|三个.*根|[两二三多].*零点/.test(text)) add('p-extremum-zero', 100, '极值穿过零点是根数变化的候选事件；先核对单调段及端点行为。');
  if (/相切|切线/.test(text)) add('p-tangency', 100, '内部切触联立函数值与斜率相等；仍需核验全局性质。');
  if (inequality || facts.structure !== unknown || facts.positive !== unknown) {
    checks.add('逐个联立等号条件与全部约束；多步估计必须同时取等。');
    if (facts.positive !== 'yes') {
      trace.push(facts.positive === 'no' ? '教师确认并非正项，停止直接使用正数基本不等式。' : '正数条件未确认，基本不等式仅作为待核验路径。');
      risks.push('未确认非负性（倒数项需正）时，不可直接使用基本不等式。');
    }
    const ready = facts.domain === 'checked' && facts.positive === 'yes' && facts.equality === 'reachable';
    const key = { fixedSum: 'i-fixed-sum', fixedProduct: 'i-fixed-product', reciprocal: 'i-reciprocal', square: 'i-square', derivative: 'i-derivative', unknown: 'i-attainability' }[facts.structure];
    if (facts.positive !== 'no' || ['square', 'derivative'].includes(facts.structure)) add(key, 110, '根据教师确认的结构选择课内依据，随后验证等号与限制。', ready);
    if (facts.equality === 'unreachable') {
      add('i-interval', 120, '无约束等号点不在可行域；需重算受限最值，原界不一定锐。');
      risks.push('等号不可达时不能将基本不等式给出的下界直接称为最小值。');
    }
    add('i-attainability', 70, '下界与实际最小值之间还需要可达性证明。');
    if (/frac|1\s*\/|倒数/.test(text)) { add('i-reciprocal', 85, '倒数结构可尝试通分配对；正数条件仍需核验。'); add('i-make-one', 70, '有定和约束时可尝试凑1，但必须检查等号同步。'); }
    add('i-square', 65, '先检查作差、平方非负或配方是否直接解决，减少复杂分类。');
    add('i-derivative', 55, '当等号配凑失败且可降为一元时，可用导数作替代。');
  }
  if (hasUnreadableQuestionText(question)) {
    choices.clear(); trace.push('题干含不可读的 PDF 字符，需核对原图并修正公式后分析。');
    risks.push('不能从损坏的题干推断正负、参数或等号条件。');
  }
  if (/棱锥|二面角|半椭圆|半圆|△ABC|轨迹方程/.test(text) && !parameter && facts.structure === unknown) {
    choices.clear(); trace.push('题目主要为几何结构，当前两个专题不足以确定路径，请先完成几何转化。');
  }
  if (!choices.size) trace.push('没有识别到这两个专题的可靠结构信号，请人工选择知识点或补充题干。');
  let preferred = false;
  const items = methods.filter(m => m.content.strategy && m.status !== 'rejected' && m.evidenceValid && !m.merged_into && choices.has(m.content.strategy.key))
    .sort((a,b) => choices.get(b.content.strategy!.key)!.score - choices.get(a.content.strategy!.key)!.score || a.id.localeCompare(b.id))
    .slice(0,8).map(m => {
      const s = m.content.strategy!, c = choices.get(s.key)!;
      const eligible = c.eligible && m.status === 'approved';
      const verdict = eligible && !preferred ? 'preferred' : eligible ? 'alternative' : 'conditional';
      if (verdict === 'preferred') preferred = true;
      return { id: m.id, revision: m.revision, name: m.content.name, key: s.key, status: m.status, verdict,
        reason: c.reason, conditions: m.content.conditions, checks: s.checks, mechanisms: s.criticalMechanisms, alternatives: s.alternatives,
        whySimpler: s.whySimpler, prerequisites: s.knowledgeCodes, links: s.links, transfer: m.content.variants,
        standardSolution: s.standardSolution, teacherNotes: s.teacherNotes };
    });
  return { engine: 'rules-v2' as const, reviewRequired: true as const, facts, trace, checks: [...checks], risks, items,
    notice: '关键词只用于召回。结构判断来自教师填写，规则未做符号计算或生成本题证明；候选卡和未确认条件不会变成已验证关联。' };
}

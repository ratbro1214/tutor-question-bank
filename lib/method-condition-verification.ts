import { z } from 'zod';
import { hasUnreadableQuestionText } from './question-text-quality';

// A deliberately bounded arithmetic verifier. No eval, expression parser or sampling proof.
const number = z.number().finite().min(-1e6).max(1e6);
const interval = z.object({ left: number, right: number, leftClosed: z.boolean(), rightClosed: z.boolean() }).strict();
const common = { excerpt: z.string().trim().min(4).max(2000), confirmed: z.boolean(), interval };
export const conditionInputSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('parameter-quadratic'), u: number, v: number, w: number,
    quantifier: z.enum(['all', 'exists']), direction: z.enum(['upper', 'lower']), strict: z.boolean() }).strict(),
  z.object({ ...common, kind: z.literal('positive-reciprocal'), p: number.positive(), q: number.positive() }).strict(),
]);
export type ConditionInput = z.infer<typeof conditionInputSchema>;
export type Extremum = { value: number; attained: boolean; at: number[] };
export type ConditionVerification = {
  status: 'verified' | 'needs_review' | 'unsupported';
  topic: ConditionInput['kind'] | null; summary: string; steps: string[];
  minimum?: Extremum; maximum?: Extremum;
  parameter?: { direction: 'upper' | 'lower'; boundary: number; included: boolean };
  equality?: { x: number; inDomain: boolean; lowerBound: number };
};
const limit = '仅核验教师录入并确认的标准式；不证明原题到标准式的等价变形，也不自动审核题目关系。';

export function verifyMethodConditions(question: string, raw?: unknown): ConditionVerification {
  if (raw === undefined) return { status: 'needs_review', topic: null, summary: '尚未提供标准式核验。', steps: [limit] };
  const input = conditionInputSchema.parse(raw);
  const base = { topic: input.kind, steps: [limit] };
  if (hasUnreadableQuestionText(question)) return { ...base, status: 'needs_review', summary: '原题含不可读字符，请先对照原图修正题干。' };
  if (!input.confirmed || !question.includes(input.excerpt)) return { ...base, status: 'needs_review', summary: '请核对标准式与题干，并逐字引用本题条件；当前未计算。' };
  const { left: l, right: r, leftClosed: lc, rightClosed: rc } = input.interval;
  if (!(l < r)) return { ...base, status: 'unsupported', summary: '当前只支持左右端点不同、非空的有限区间。' };
  // Extremely narrow intervals and catastrophic cancellation are refused, never rounded into a proof.
  if (r - l < 1e-9 * Math.max(1, Math.abs(l), Math.abs(r))) return { ...base, status: 'unsupported', summary: '区间过窄，超出当前浮点核验的稳定范围。' };
  const inside = (x: number) => (x > l || (lc && x === l)) && (x < r || (rc && x === r));
  const points = [{ x: l, attained: lc }, { x: r, attained: rc }];
  const steps = [...base.steps, `核验区间：${lc ? '[' : '('}${l}, ${r}${rc ? ']' : ')'}`];
  let value: (x: number) => number;
  let equality: ConditionVerification['equality'];
  if (input.kind === 'parameter-quadratic') {
    value = x => (input.u * x + input.v) * x + input.w;
    if (input.u !== 0) {
      const x = -input.v / (2 * input.u);
      if (x > l && x < r) points.push({ x, attained: true });
      steps.push(`二次项系数 ${input.u} 非零；驻点 x=${x}，与两个端点共同比较。`);
    } else steps.push(input.v === 0 ? '二次项与一次项均为零，按常函数处理；任意内部点均取到该值。' : '二次项系数为零，按一次函数处理，不使用判别式或二次函数顶点公式。');
    if (input.u === 0 && input.v === 0) points.push({ x: l + (r - l) / 2, attained: true });
  } else {
    if (l <= 0) return { ...base, status: 'unsupported', summary: '倒数型核验要求整个区间严格为正，且左端点大于零。' };
    value = x => input.p * x + input.q / x;
    const x = Math.sqrt(input.q / input.p);
    equality = { x, inDomain: inside(x), lowerBound: 2 * Math.sqrt(input.p * input.q) };
    if (x > l && x < r) points.push({ x, attained: true });
    steps.push(`p=${input.p}>0，q=${input.q}>0；基本不等式下界为 ${equality.lowerBound}，等号要求 x=√(q/p)=${x}。`, equality.inDomain ? '等号点满足录入区间。' : '等号点不在录入区间，不能把通用下界直接称为最小值；改比较受限区间上的端点与驻点。');
  }
  const values = points.map(p => ({ ...p, value: value(p.x) }));
  if (values.some(p => !Number.isFinite(p.value))) return { ...base, status: 'unsupported', summary: '数值溢出，需人工核验。' };
  const extrema = (min: boolean): Extremum => {
    const best = (min ? Math.min : Math.max)(...values.map(p => p.value));
    const matches = values.filter(p => p.value === best);
    return { value: best, attained: matches.some(p => p.attained), at: matches.filter(p => p.attained).map(p => p.x) };
  };
  // Near equal but unequal values cannot safely decide an open/closed boundary.
  if (values.some((a, i) => values.some((b, j) => i < j && a.value !== b.value && Math.abs(a.value - b.value) <= 1e-12 * Math.max(1, Math.abs(a.value), Math.abs(b.value))))) {
    return { ...base, status: 'unsupported', summary: '候选值过于接近，当前精度不足以判定端点；需精确计算。' };
  }
  const minimum = extrema(true), maximum = extrema(false);
  steps.push(`下确界 ${minimum.value}（${minimum.attained ? '可取到，是最小值' : '不可取到，无最小值'}）；上确界 ${maximum.value}（${maximum.attained ? '可取到，是最大值' : '不可取到，无最大值'}）。`);
  if (input.kind === 'parameter-quadratic') {
    const target = (input.quantifier === 'all') === (input.direction === 'upper') ? minimum : maximum;
    const included = input.quantifier === 'all' ? !input.strict || !target.attained : !input.strict && target.attained;
    const sign = input.direction === 'upper' ? (included ? '≤' : '<') : (included ? '≥' : '>');
    steps.push(input.quantifier === 'all' ? '全称约束取所有逐点参数集合的交集。' : '存在约束取所有逐点参数集合的并集。', `参数集合：a ${sign} ${target.value}；已分别考虑严格性、量词和最紧界能否取到。`);
    return { status: 'verified', topic: input.kind, summary: `录入标准式得到 a ${sign} ${target.value}。`, steps, minimum, maximum,
      parameter: { direction: input.direction, boundary: target.value, included } };
  }
  return { status: 'verified', topic: input.kind, summary: equality!.inDomain ? '录入标准式的等号点可达。' : '通用等号点不可达，已计算受限区间的界。', steps, minimum, maximum, equality };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMethodConditions, type ConditionInput } from '../lib/method-condition-verification';
import { decideStrategies } from '../lib/strategy-decision';
import { validateRecommendations } from '../lib/method-recommendation';
import { coreStrategies } from '../lib/method-strategies';
import type { GraphMethod } from '../lib/knowledge-graph';

const question = '条件 x∈(0,2)，求参数范围及最值。';
const parameter: ConditionInput = { kind: 'parameter-quadratic', excerpt: 'x∈(0,2)', confirmed: true, interval: { left: 0, right: 2, leftClosed: false, rightClosed: false }, u: 1, v: 0, w: 0, quantifier: 'all', direction: 'upper', strict: true };
const reciprocal: ConditionInput = { kind: 'positive-reciprocal', excerpt: '已知正数', confirmed: true, interval: { left: 2, right: 5, leftClosed: false, rightClosed: false }, p: 1, q: 1 };
const methods: GraphMethod[] = coreStrategies.cards.map(content => ({ id: content.strategy.key, scope_id: 'test', revision: 1, status: 'approved', content, source: { origin: 'pilot', note: 'TEST', evidence: null }, evidenceValid: true, merged_into: null, updated_at: '' }));

test('全称与存在、上下方向、严格与非严格、端点可达的16种组合', () => {
  for (const closed of [true, false]) for (const quantifier of ['all', 'exists'] as const) for (const direction of ['upper', 'lower'] as const) for (const strict of [true, false]) {
    const result = verifyMethodConditions(question, { ...parameter, quantifier, direction, strict, interval: { ...parameter.interval, leftClosed: closed, rightClosed: closed } });
    const lower = (quantifier === 'all' && direction === 'upper') || (quantifier === 'exists' && direction === 'lower');
    // For g=x² on (0,2), inf=0 and sup=4; on [0,2] both are attained.
    const included = quantifier === 'all' ? !(strict && closed) : !strict && closed;
    assert.deepEqual(result.parameter, { direction, boundary: lower ? 0 : 4, included });
  }
});
test('退化为一次与常函数，开区间常数仍可取到；驻点参与极值', () => {
  assert.equal(verifyMethodConditions(question, { ...parameter, u: 0, v: 2, w: 1, direction: 'lower', strict: false }).parameter?.boundary, 5);
  const constant = verifyMethodConditions(question, { ...parameter, u: 0, v: 0, w: 3 });
  assert.equal(constant.minimum?.attained, true); assert.equal(constant.parameter?.included, false);
  const vertex = verifyMethodConditions(question, { ...parameter, u: 1, v: -2, w: 1 });
  assert.equal(vertex.minimum?.value, 0); assert.deepEqual(vertex.minimum?.at, [1]);
  assert.equal(vertex.parameter?.included, false);
});
test('等号不可达时重算受限下界，并区分最小值和下确界', () => {
  const open = verifyMethodConditions('已知正数 x>2，求最小值', reciprocal);
  assert.equal(open.equality?.inDomain, false); assert.equal(open.equality?.lowerBound, 2);
  assert.equal(open.minimum?.value, 2.5); assert.equal(open.minimum?.attained, false);
  const closed = verifyMethodConditions('已知正数', { ...reciprocal, interval: { ...reciprocal.interval, leftClosed: true } });
  assert.equal(closed.minimum?.value, 2.5); assert.equal(closed.minimum?.attained, true);
  const interior = verifyMethodConditions('已知正数', { ...reciprocal, q: 4, interval: { left: 1, right: 4, leftClosed: true, rightClosed: true } });
  assert.equal(interior.equality?.inDomain, true); assert.equal(interior.minimum?.value, 4);
});
test('未确认、错题引用、非正域、无效区间和数值不稳定不输出已核验结论', () => {
  assert.equal(verifyMethodConditions(question).status, 'needs_review');
  assert.equal(verifyMethodConditions(question, { ...parameter, confirmed: false }).status, 'needs_review');
  assert.equal(verifyMethodConditions('另一道题目', parameter).status, 'needs_review');
  assert.equal(verifyMethodConditions(question, { ...parameter, interval: { ...parameter.interval, right: 0 } }).status, 'unsupported');
  assert.equal(verifyMethodConditions('已知正数', { ...reciprocal, interval: { ...reciprocal.interval, left: -1 } }).status, 'unsupported');
  assert.equal(verifyMethodConditions(question, { ...parameter, u: 0, v: 1e-14 }).status, 'unsupported');
  assert.throws(() => verifyMethodConditions(question, { ...parameter, u: Infinity }));
});
test('模板不提升候选审核状态，矛盾条件降级，失败核验不能保留规则首选', () => {
  const facts = { domain: 'checked', positive: 'yes', equality: 'reachable', structure: 'reciprocal' };
  const result = decideStrategies('已知正数，求最小值', methods, facts, reciprocal);
  assert.ok(result.risks.some(r => r.includes('冲突'))); assert.ok(result.items.every(i => i.verdict === 'conditional'));
  const pending = decideStrategies('已知正数，求最小值', methods.map(m => ({ ...m, status: 'candidate' })), facts, { ...reciprocal, interval: { left: .5, right: 2, leftClosed: true, rightClosed: true } });
  assert.ok(pending.items.every(i => i.verdict === 'conditional'));
  const parameterFacts = { domain: 'checked', degeneration: 'checked', separable: 'yes', divisor: 'positive', quantifier: 'all', bound: 'upper', objective: 'maximum' };
  const unavailableMaximum = decideStrategies(question, methods, parameterFacts, { ...parameter, interval: { ...parameter.interval, leftClosed: true } });
  assert.ok(unavailableMaximum.risks.some(r => r.includes('没有所选'))); assert.ok(unavailableMaximum.items.every(i => i.verdict === 'conditional'));
  const mismatched = decideStrategies(question, methods, { ...parameterFacts, quantifier: 'exists' }, parameter);
  assert.ok(mismatched.risks.some(r => r.includes('量词'))); assert.ok(mismatched.items.every(i => i.verdict === 'conditional'));
  assert.equal(verifyMethodConditions(question + '\uF03E', parameter).status, 'needs_review');
});
test('AI错误引用清空步骤；不可达等号的倒数方法不能继续首选', () => {
  const item = { methodId: 'i-reciprocal', methodRevision: 1, verdict: 'preferred', reason: '等号取最小', conditions: '正数', evidence: '已知正数', efficiency: '快', generality: '有限', teachingValue: '等号', steps: ['取x=1得到最小值2'], variation: '变式' };
  const raw = { features: { knowledge: [], structure: '倒数', constraints: '正数', goal: '最值' }, items: [item] };
  const result = validateRecommendations(raw, methods, '已知正数，求最小值', reciprocal);
  assert.equal(result.items[0].verdict, 'uncertain'); assert.deepEqual(result.items[0].steps, []);
  const missing = validateRecommendations(raw, methods, '不同题干');
  assert.equal(missing.items[0].verdict, 'uncertain'); assert.deepEqual(missing.items[0].steps, []);
});

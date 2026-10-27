import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMethodEvaluationPack, scoreMethodPredictions, type MethodPrediction } from '../lib/method-evaluation';

const pack = validateMethodEvaluationPack({ version: 1, developerId: 'dev', name: 'test', cases: [{ id: 't1', group: 'g1', split: 'test', source: '教师自编', question: '求参数的范围', facts: {} }] });
const hash = 'a'.repeat(64);
const labels = { packHash: hash, independentReviewDeclared: true, labels: [{ caseId: 't1', reviewerId: 'teacher', rationale: '应先处理次数退化与定义域', acceptableKeys: ['domain'], forbiddenPreferredKeys: ['wrong'] }] };
const predictions: MethodPrediction[] = [{ caseId: 't1', engine: 'rules', rankedKeys: ['domain', 'wrong'], preferredKeys: ['wrong'] }];

test('同源变式及重复题干不可跨开发集与测试集', () => {
  assert.throws(() => validateMethodEvaluationPack({ ...pack, cases: [...pack.cases, { ...pack.cases[0], id: 't2', split: 'development' }] }), /同源/);
  assert.throws(() => validateMethodEvaluationPack({ ...pack, cases: [...pack.cases, { ...pack.cases[0], id: 't2', group: 'g2', split: 'development' }] }), /重复题干/);
});
test('独立标注与研发标注分开，空分母为null且显示覆盖率', () => {
  const score = scoreMethodPredictions(pack, hash, labels, predictions, ['domain', 'wrong']);
  const row = score.find(s => s.split === 'test')!;
  assert.equal(row.labelBasis, 'reviewer-declared-independent'); assert.equal(row.recallAt3.rate, 1); assert.equal(row.unsafePreferred.rate, 1);
  assert.equal(score.find(s => s.split === 'development')!.recallAt3.rate, null);
  const self = structuredClone(labels); self.labels[0].reviewerId = 'dev';
  assert.equal(scoreMethodPredictions(pack, hash, self, predictions, ['domain', 'wrong'])[1].labelBasis, 'development-only');
});
test('拒绝错版本、重复标注、未知方法、缺失或重复预测', () => {
  assert.throws(() => scoreMethodPredictions(pack, 'b'.repeat(64), labels, predictions, ['domain', 'wrong']), /哈希/);
  assert.throws(() => scoreMethodPredictions(pack, hash, { ...labels, labels: [...labels.labels, labels.labels[0]] }, predictions, ['domain', 'wrong']), /重复/);
  assert.throws(() => scoreMethodPredictions(pack, hash, labels, predictions, ['wrong']), /未知方法/);
  assert.throws(() => scoreMethodPredictions(pack, hash, labels, [...predictions, ...predictions], ['domain', 'wrong']), /恰有一条/);
  assert.throws(() => scoreMethodPredictions(pack, hash, labels, [], ['domain', 'wrong']), /没有/);
});
test('多种可接受方法区分题目命中率与方法召回率', () => {
  const multiple = structuredClone(labels); multiple.labels[0].acceptableKeys.push('second');
  const row = scoreMethodPredictions(pack, hash, multiple, predictions, ['domain', 'second', 'wrong'])[1];
  assert.equal(row.hitAt3.rate, 1); assert.equal(row.recallAt3.rate, .5);
});

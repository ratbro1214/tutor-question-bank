import { z } from 'zod';
import { decisionFactsSchema } from './strategy-decision';
import { conditionInputSchema, type ConditionVerification } from './method-condition-verification';

const id = z.string().trim().min(1).max(160);
export const methodEvaluationPackSchema = z.object({
  version: z.literal(1), developerId: id, name: id,
  cases: z.array(z.object({ id, group: id, split: z.enum(['development', 'test']), source: z.string().min(1).max(2000),
    question: z.string().min(4).max(16000), facts: decisionFactsSchema.default({}), verification: conditionInputSchema.optional() }).strict()).min(1).max(1000),
}).strict();
export const methodEvaluationLabelsSchema = z.object({
  packHash: z.string().regex(/^[a-f0-9]{64}$/), independentReviewDeclared: z.boolean(),
  labels: z.array(z.object({ caseId: id, reviewerId: id, rationale: z.string().trim().min(8).max(4000),
    acceptableKeys: z.array(id).max(23), forbiddenPreferredKeys: z.array(id).max(23),
    verification: z.object({ status: z.enum(['verified', 'needs_review', 'unsupported']),
      boundary: z.number().finite().optional(), included: z.boolean().optional(), equalityReachable: z.boolean().optional() }).strict().optional(),
  }).strict()).min(1).max(1000),
}).strict();
export type EvaluationPack = z.infer<typeof methodEvaluationPackSchema>;
export type EvaluationLabels = z.infer<typeof methodEvaluationLabelsSchema>;
export type MethodPrediction = { caseId: string; engine: string; rankedKeys: string[]; preferredKeys: string[]; verification?: ConditionVerification };

export function validateMethodEvaluationPack(raw: unknown) {
  const pack = methodEvaluationPackSchema.parse(raw), ids = new Set<string>(), splits = new Map<string, string>();
  const questions = new Map<string, string>();
  for (const row of pack.cases) {
    if (ids.has(row.id)) throw Error('评测题目 ID 重复。');
    ids.add(row.id);
    if (splits.has(row.group) && splits.get(row.group) !== row.split) throw Error('同源题或变式组不得跨开发集与测试集。');
    splits.set(row.group, row.split);
    const normalized = row.question.normalize('NFKC').replace(/\s/g, '');
    if (questions.has(normalized) && questions.get(normalized) !== row.split) throw Error('重复题干不得跨开发集与测试集。');
    questions.set(normalized, row.split);
  }
  return pack;
}

export function scoreMethodPredictions(pack: EvaluationPack, packHash: string, rawLabels: unknown, predictions: MethodPrediction[], knownKeys: string[]) {
  const labels = methodEvaluationLabelsSchema.parse(rawLabels);
  if (labels.packHash !== packHash) throw Error('标注对应的冻结题包哈希不一致。');
  const seen = new Set<string>(), keys = new Set(knownKeys);
  for (const label of labels.labels) {
    if (seen.has(label.caseId) || !pack.cases.some(c => c.id === label.caseId)) throw Error('标注包含重复或不存在的题目。');
    seen.add(label.caseId);
    if ([...label.acceptableKeys, ...label.forbiddenPreferredKeys].some(k => !keys.has(k))) throw Error('标注引用未知方法键。');
    if (new Set(label.acceptableKeys).size !== label.acceptableKeys.length || new Set(label.forbiddenPreferredKeys).size !== label.forbiddenPreferredKeys.length) throw Error('同一标注内的方法键不得重复。');
    if (label.acceptableKeys.some(k => label.forbiddenPreferredKeys.includes(k))) throw Error('可接受方法与禁止首选方法冲突。');
    if (label.verification && (label.verification.included !== undefined) !== (label.verification.boundary !== undefined)) throw Error('参数边界与端点开闭必须同时标注。');
  }
  const engines = [...new Set(predictions.map(p => p.engine))];
  if (!engines.length) throw Error('没有可评分的预测。');
  for (const p of predictions) {
    if (!pack.cases.some(c => c.id === p.caseId) || [...p.rankedKeys, ...p.preferredKeys].some(k => !keys.has(k))) throw Error('预测包含未知题目或方法。');
    if (new Set(p.rankedKeys).size !== p.rankedKeys.length || new Set(p.preferredKeys).size !== p.preferredKeys.length || p.preferredKeys.some(k => !p.rankedKeys.includes(k))) throw Error('预测方法重复或首选不在候选列表中。');
  }
  return engines.flatMap(engine => (['development', 'test'] as const).map(split => {
    const cases = pack.cases.filter(c => c.split === split), caseIds = new Set(cases.map(c => c.id));
    const selected = labels.labels.filter(l => caseIds.has(l.caseId));
    let hits = 0, relevant = 0, recalled = 0, relevantMethods = 0, unsafe = 0, recommended = 0, abstained = 0, verificationCorrect = 0, verificationTotal = 0;
    for (const label of selected) {
      const rows = predictions.filter(p => p.engine === engine && p.caseId === label.caseId);
      if (rows.length !== 1) throw Error('每个引擎对已标注题目必须恰有一条预测。');
      const p = rows[0];
      if (label.acceptableKeys.length) {
        relevant++;
        const found = label.acceptableKeys.filter(k => p.rankedKeys.slice(0, 3).includes(k)).length;
        if (found) hits++;
        recalled += found; relevantMethods += label.acceptableKeys.length;
      }
      if (!p.preferredKeys.length) abstained++; else recommended++;
      if (p.preferredKeys.some(k => label.forbiddenPreferredKeys.includes(k))) unsafe++;
      if (label.verification) {
        verificationTotal++;
        const expected = label.verification, actual = p.verification;
        const boundary = expected.boundary;
        if (actual?.status === expected.status && (boundary === undefined || (!!actual.parameter && Math.abs(actual.parameter.boundary - boundary) <= 1e-9 * Math.max(1, Math.abs(boundary)) && actual.parameter.included === expected.included)) && (expected.equalityReachable === undefined || actual.equality?.inDomain === expected.equalityReachable)) verificationCorrect++;
      }
    }
    const independent = split === 'test' && labels.independentReviewDeclared && selected.length > 0 && selected.every(l => l.reviewerId !== pack.developerId);
    const ratio = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
    return { engine, split, labelBasis: independent ? 'reviewer-declared-independent' : 'development-only',
      annotationCoverage: ratio(selected.length, cases.length), hitAt3: ratio(hits, relevant), recallAt3: ratio(recalled, relevantMethods), unsafePreferred: ratio(unsafe, selected.length),
      recommendationCoverage: ratio(recommended, selected.length), abstention: ratio(abstained, selected.length), verificationAccuracy: ratio(verificationCorrect, verificationTotal) };
  }));
}

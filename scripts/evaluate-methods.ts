import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreStrategies } from '../lib/method-strategies';
import type { GraphMethod } from '../lib/knowledge-graph';
import { decideStrategies } from '../lib/strategy-decision';
import { retrieveMethods } from '../lib/method-recommendation';
import { validateMethodEvaluationPack, scoreMethodPredictions, type MethodPrediction } from '../lib/method-evaluation';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length % 2 || args.some((v, i) => i % 2 === 0 && !['--pack', '--labels'].includes(v)) || new Set(args.filter((_, i) => i % 2 === 0)).size !== args.length / 2) throw Error('用法：npm run evaluate:methods -- [--pack 题包.json] [--labels 独立标注.json]');
const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i], args[2 * i + 1]]));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pack = validateMethodEvaluationPack(JSON.parse(await readFile(resolve(root, options['--pack'] || 'data/method-evaluation/development-v1.json'), 'utf8')));
const packHash = hash(pack);
const sourceFiles = ['lib/strategy-decision.ts', 'lib/method-condition-verification.ts', 'lib/method-recommendation.ts', 'lib/method-evaluation.ts', 'scripts/evaluate-methods.ts'];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await readFile(resolve(root, file))).digest('hex')])));
// Virtual approved snapshots are used ONLY in this isolated evaluation, never written to the database.
const methods: GraphMethod[] = coreStrategies.cards.map(content => ({ id: content.strategy.key, scope_id: 'evaluation-only', revision: 1, status: 'approved', content,
  source: { origin: 'pilot', note: '离线评测虚拟快照，非业务审核', evidence: null }, evidenceValid: true, merged_into: null, updated_at: '' }));
const predictions: MethodPrediction[] = pack.cases.flatMap(row => {
  const rules = decideStrategies(row.question, methods, row.facts);
  const verified = decideStrategies(row.question, methods, row.facts, row.verification);
  const prediction = (engine: string, r: typeof rules): MethodPrediction => ({ caseId: row.id, engine, rankedKeys: r.items.map(i => i.key), preferredKeys: r.items.filter(i => i.verdict === 'preferred').map(i => i.key), verification: r.verification });
  return [{ caseId: row.id, engine: 'retrieval-only', rankedKeys: retrieveMethods(row.question, methods).map(m => m.content.strategy!.key), preferredKeys: [] }, prediction('rules', rules), prediction('rules-with-verification', verified)];
});
const labels = options['--labels'] ? JSON.parse(await readFile(resolve(root, options['--labels']), 'utf8')) : null;
const scores = labels ? scoreMethodPredictions(pack, packHash, labels, predictions, methods.map(m => m.id)) : null;
const output = resolve(root, '../outputs/method-evaluation', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const report = { generatedAt: new Date().toISOString(), packHash, labelsHash: labels ? hash(labels) : null, methodSnapshotHash: hash(coreStrategies), sourceHashes, engineVersion: 'conditions-v1', modelCalls: 0,
  note: '研发样例不属于独立评测。独立性由标注者声明，程序无法认证身份；不评价真实教学收益。', scores, predictions };
const files: Record<string, unknown> = {
  'frozen-pack.json': pack,
  'predictions.json': report,
  'blind-review-cases.json': pack.cases.map(({ id, group, split, source, question }) => ({ id, group, split, source, question })),
  'labels-template.json': { packHash, independentReviewDeclared: false, labels: pack.cases.map(c => ({ caseId: c.id, reviewerId: '', rationale: '', acceptableKeys: [], forbiddenPreferredKeys: [] })) },
  'method-key-reference.json': methods.map(m => ({ key: m.id, name: m.content.name, conditions: m.content.conditions })),
};
for (const [name, value] of Object.entries(files)) await writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
if (labels) await writeFile(resolve(output, 'labels-used.json'), JSON.stringify(labels, null, 2) + '\n');
await writeFile(resolve(output, '报告.md'), `# 方法推荐评测\n\n题包 SHA-256：${packHash}\n\n题目：${pack.cases.length}；测试集：${pack.cases.filter(c => c.split === 'test').length}。模型调用：0。\n\n${scores ? '评分见 predictions.json，按引擎和开发／测试集分别统计；查看标注覆盖率与独立性声明。' : '尚无外部标注，不计算准确率。请先冻结外部题包，再让独立教师填写标注；不要将研发样例改名为独立测试集。'}\n\n本工具比较文本检索、现有规则、规则加标准式核验；未运行大模型基线，不证明教学收益。核验只针对教师确认录入的标准式，不证明等价变形。\n`);
console.log(JSON.stringify({ output, packHash, cases: pack.cases.length, scored: scores !== null }));

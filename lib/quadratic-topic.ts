import { z } from 'zod';
import { verifyMethodConditions, type ConditionInput } from './method-condition-verification';
import { validateMethodEvaluationPack } from './method-evaluation';

type Standard = Extract<ConditionInput, { kind: 'parameter-quadratic' }>;
export type TopicCase = { id: string; family: string; title: string; question: string; prompt: string; method: string; verification: Standard };
function make(id: string, family: string, title: string, formula: string, u: number, v: number, w: number,
  left: number, right: number, leftClosed: boolean, rightClosed: boolean,
  quantifier: Standard['quantifier'], direction: Standard['direction'], strict: boolean, prompt: string): TopicCase {
  const domain = `x∈${leftClosed ? '[' : '('}${left},${right}${rightClosed ? ']' : ')'}`;
  const sign = direction === 'upper' ? (strict ? '<' : '≤') : (strict ? '>' : '≥');
  return { id, family, title, question: `${quantifier === 'all' ? '对所有' : '存在'} ${domain}，${quantifier === 'all' ? '使' : '使得'} a${sign}${formula}${quantifier === 'all' ? ' 恒成立' : ''}，求实数参数 a 的范围。`, prompt,
    method: `${quantifier === 'all' ? '全称条件取逐点参数集合的交集' : '存在条件取逐点参数集合的并集'}；${u === 0 ? '先识别一次或常函数退化' : '比较区间端点与区间内顶点'}；最后核对严格性和边界可达性。`,
    verification: { kind: 'parameter-quadratic', excerpt: domain, confirmed: true, u, v, w,
      interval: { left, right, leftClosed, rightClosed }, quantifier, direction, strict } };
}
const edge = '请分别说明：区间端点是否属于定义域？最紧的界能否取到？严格不等式是否一定排除参数边界？';
const quantifier = '请写出每个 x 对应的参数集合，再说明应取交集还是并集。仅算出函数最值还缺哪一步？';
const vertex = '请计算顶点横坐标并检查它是否在区间内；如果不在，应该比较哪些候选点？';
const degree = '请先判断函数实际次数。二次项为零时，为什么不能继续使用二次函数顶点公式？';
export const quadraticCases: TopicCase[] = [
  make('E1', '端点与严格性', '开区间与严格条件', 'x²', 1, 0, 0, 0, 2, false, false, 'all', 'upper', true, edge),
  make('E2', '端点与严格性', '包含最紧端点', 'x²', 1, 0, 0, 0, 2, true, true, 'all', 'upper', true, edge),
  make('E3', '端点与严格性', '平移后的开端点', '(x−1)²+2', 1, -2, 3, 1, 3, false, true, 'all', 'upper', true, edge),
  make('E4', '端点与严格性', '平移后的闭端点', '(x−2)²−1', 1, -4, 3, 2, 4, true, false, 'all', 'upper', true, edge),
  make('Q1', '全称与存在', '全称条件的交集', 'x²', 1, 0, 0, 0, 2, true, true, 'all', 'upper', false, quantifier),
  make('Q2', '全称与存在', '存在条件的并集', 'x²', 1, 0, 0, 0, 2, true, true, 'exists', 'upper', false, quantifier),
  make('Q3', '全称与存在', '存在但上界不可达', 'x²', 1, 0, 0, 0, 3, false, false, 'exists', 'upper', false, quantifier),
  make('Q4', '全称与存在', '反向存在约束', 'x²', 1, 0, 0, 1, 3, false, true, 'exists', 'lower', true, quantifier),
  make('V1', '顶点与区间', '顶点在区间内', '(x−1)²', 1, -2, 1, 0, 3, true, true, 'all', 'upper', false, vertex),
  make('V2', '顶点与区间', '顶点在区间外', '(x−1)²', 1, -2, 1, 2, 4, true, true, 'all', 'upper', false, vertex),
  make('V3', '顶点与区间', '开口向下的上界', '−x²+4x', -1, 4, 0, 0, 3, true, true, 'all', 'lower', false, vertex),
  make('V4', '顶点与区间', '顶点落在被排除的端点', '(x−3)²+1', 1, -6, 10, 3, 5, false, true, 'all', 'upper', true, vertex),
  make('D1', '次数退化', '退化为一次函数', '2x+1', 0, 2, 1, 0, 2, false, false, 'all', 'lower', false, degree),
  make('D2', '次数退化', '退化为常函数', '3', 0, 0, 3, 0, 2, false, false, 'exists', 'upper', true, degree),
  make('D3', '次数退化', '递减一次函数', '−2x+4', 0, -2, 4, 1, 3, true, false, 'all', 'upper', true, degree),
  make('D4', '次数退化', '常函数的全称条件', '−1', 0, 0, -1, -2, 2, false, false, 'all', 'lower', false, degree),
];
export function topicCase(id: string) {
  const row = quadraticCases.find(c => c.id === id);
  if (!row) throw Error('专题题目不存在。');
  return row;
}
export const topicStages = ['initial', 'diagnostic', 'teaching', 'transfer', 'review'] as const;
export const stageNames = { initial: '首次作答', diagnostic: '诊断追问', teaching: '教师讲解', transfer: '新题检查', review: '间隔复查' };
const eventSchema = z.object({
  id: z.string().min(1), stage: z.enum(topicStages), caseId: z.string(),
  response: z.string().trim().min(1).max(6000), correctness: z.enum(['correct', 'incorrect', 'uncertain']),
  support: z.enum(['independent', 'prompted', 'explained']), at: z.string().datetime(), targetId: z.string().nullable(),
}).strict();
export const topicSessionSchema = z.object({ version: z.literal(1), topic: z.literal('quadratic-parameter-v1'),
  mode: z.enum(['rehearsal', 'observed']), anchorId: z.string(), events: z.array(eventSchema).max(100),
}).strict();
export type TopicSession = z.infer<typeof topicSessionSchema>;
export type TopicEvent = z.infer<typeof eventSchema>;
export function newTopicSession(anchorId: string, mode: TopicSession['mode']): TopicSession {
  topicCase(anchorId);
  return { version: 1, topic: 'quadratic-parameter-v1', mode, anchorId, events: [] };
}
export function nextTopicStage(session: TopicSession) {
  return topicStages[session.events.length] ?? null;
}
// Only explicitly linked records advance this small pilot workflow. No inferred error labels or mastery score.
export function appendTopicEvent(session: TopicSession, raw: unknown): TopicSession {
  const e = eventSchema.parse(raw), stage = nextTopicStage(session);
  if (!stage || e.stage !== stage) throw Error('请按首次作答、诊断、讲解、新题检查、复查的顺序记录。');
  if (session.events.some(old => old.id === e.id)) throw Error('记录编号重复。');
  if (session.events.length && Date.parse(e.at) < Date.parse(session.events.at(-1)!.at)) throw Error('记录时间不能早于上一条记录。');
  const anchor = topicCase(session.anchorId), row = topicCase(e.caseId), initial = session.events[0];
  if (stage === 'initial' && (e.caseId !== anchor.id || e.targetId !== null)) throw Error('首次作答必须对应本次原题。');
  if (stage !== 'initial' && e.targetId !== initial.id) throw Error('后续记录必须明确关联本次首次作答。');
  if (row.family !== anchor.family) throw Error('请选择同一观察重点的题目。');
  if (stage === 'teaching' && e.caseId !== anchor.id) throw Error('讲解记录应关联原题。');
  if (stage !== 'initial' && stage !== 'teaching' && session.events.some(old => old.caseId === row.id)) throw Error('后续检查请选择本次尚未使用的新题，不能把原题重做算作新题证据。');
  if (stage === 'review' && session.mode === 'observed') {
    const previous = session.events.find(old => old.stage === 'transfer')!;
    if (Date.parse(e.at) - Date.parse(previous.at) < 24 * 60 * 60 * 1000) throw Error('本试点的间隔复查至少安排在新题检查24小时后；可先导出，稍后导入继续。');
  }
  return { ...session, events: [...session.events, e] };
}
export function parseTopicSession(raw: unknown): TopicSession {
  const parsed = topicSessionSchema.parse(raw);
  return parsed.events.reduce(appendTopicEvent, newTopicSession(parsed.anchorId, parsed.mode));
}
export function topicAdvice(session: TopicSession) {
  const next = nextTopicStage(session), initial = session.events[0];
  const transfer = session.events.find(e => e.stage === 'transfer');
  const review = session.events.find(e => e.stage === 'review');
  const supported = (e?: TopicEvent) => e?.correctness === 'correct' && e.support === 'independent';
  const evidenceIds = session.events.filter(e => e.stage !== 'teaching').map(e => e.id);
  if (!initial) return { title: '先记录作答，再决定如何讲解', detail: '记录答案和能观察到的过程；没有过程时，判断可选“暂不能判断”。', evidenceIds };
  if (review) return { title: supported(transfer) && supported(review) ? '两次新题独立正确，保留后续观察' : '复查证据仍需教师判断', detail: '这里只描述本次记录，不据此认定长期掌握或教学有效。', evidenceIds };
  if (transfer) return { title: supported(transfer) ? '本次新题独立正确，等待间隔复查' : '尚无独立正确的新题证据', detail: '听懂讲解、提示后答对和独立完成应分别记录。复查使用另一道未做过的题。', evidenceIds };
  return { title: `下一步：${stageNames[next!]}`, detail: next === 'diagnostic' ? topicCase(session.anchorId).prompt : next === 'teaching' ? '结合两次作答决定讲解重点；未观察到的错因保留待核实。' : '换一道同重点的新题，记录是否独立完成。', evidenceIds };
}
export function quadraticEvaluationPack() {
  return validateMethodEvaluationPack({ version: 1, developerId: 'codex-development', name: '二次函数参数专题研发题集（非独立测试）',
    cases: quadraticCases.map(row => ({ id: row.id, group: row.family, split: 'development', source: '研发自编标准式边界题；未独立审阅',
      question: row.question, verification: row.verification,
      facts: { domain: 'checked', degeneration: 'checked', separable: 'yes', quantifier: row.verification.quantifier, bound: row.verification.direction, objective: 'range' } })) });
}
export function topicReference(row: TopicCase) { return verifyMethodConditions(row.question, row.verification); }

import { z } from 'zod';
import type { LessonContent } from './lesson-plan';
import type { LessonAIQuestion } from './lesson-generation';

export const qualityCategories = ['time', 'reference', 'completeness', 'answer', 'goals', 'knowledge', 'logic', 'questioning', 'math'] as const;
export const qualityLocationSchema = z.object({ block: z.enum(['overall', 'goals', 'analysis', 'flow', 'examples', 'exercises', 'summary', 'structure', 'stage', 'question']),
  index: z.number().int().min(0).max(29).nullable() }).strict();
export const qualityIssueSchema = z.object({ issueId: z.string().min(1).max(100), source: z.enum(['rule', 'ai']), severity: z.enum(['error', 'warning', 'suggestion']),
  category: z.enum(qualityCategories), title: z.string().min(1).max(160), description: z.string().min(1).max(2000), location: qualityLocationSchema,
  evidence: z.string().min(1).max(3000), suggestedAction: z.string().min(1).max(2000), confidence: z.enum(['certain', 'possible', 'insufficient']),
  status: z.enum(['pending', 'resolved', 'ignored']) }).strict();
export type QualityIssue = z.infer<typeof qualityIssueSchema>;
export type QualityLocation = QualityIssue['location'];
export type QualityQuestion = Pick<LessonAIQuestion, 'canonicalId' | 'revisionId' | 'answerStatus' | 'knowledgeReviewed'> & { invalid?: boolean };
// Exact snapshot identity: includes all prose, references and backups; no collision-prone short hash.
export const qualitySnapshot = (content: LessonContent) => JSON.stringify(content);
export type QualityReport = { issues: QualityIssue[]; snapshot: string; revision: number; checkedAt: string; elapsedMs: number; aiRequests: number; model?: string };
export function validQualityLocation(location: QualityLocation, content: LessonContent) {
  if (location.block === 'stage') return location.index !== null && !!content.structure?.stages[location.index];
  if (location.block === 'question') return location.index !== null && !!content.questions[location.index];
  return location.index === null;
}
export function checkLessonQuality(content: LessonContent, questions?: QualityQuestion[], revision = 0, removedQuestions = false): QualityReport {
  const start = performance.now(), issues: QualityIssue[] = [];
  const add = (category: QualityIssue['category'], severity: QualityIssue['severity'], title: string, evidence: string, block: QualityLocation['block'], index: number | null = null, action = '请定位到对应内容核对并手动修改。', confidence: QualityIssue['confidence'] = 'certain') => {
    issues.push({ issueId: `rule-${category}-${issues.length}`, source: 'rule', severity, category, title, description: evidence, location: { block, index }, evidence, suggestedAction: action, confidence, status: 'pending' });
  };
  const blank = (value: string | string[]) => Array.isArray(value) ? !value.some(v => v.trim()) : !value?.trim();
  const s = content.structure;
  if (blank(s?.objectives ?? content.goals)) add('completeness', 'warning', '缺少教学目标', '尚未填写可用教学目标。', s ? 'structure' : 'goals');
  if (s ? blank(s.focus) || blank(s.difficulties) : blank(content.analysis)) add('completeness', 'warning', '教学重难点尚未填写', '请明确重点与难点；未完成草稿仍可保存。', s ? 'structure' : 'analysis');
  if (s ? !s.stages.length : blank(content.flow)) add('completeness', 'warning', '缺少教学流程', '尚无可用教学流程。', s ? 'structure' : 'flow');
  if (blank(s?.practiceSuggestions ?? content.exercises)) add('completeness', 'warning', '练习内容为空', '当前已定义的练习区尚未填写。', s ? 'structure' : 'exercises');
  if (blank(s?.summary ?? content.summary)) add('completeness', 'warning', '总结内容为空', '当前已定义的总结区尚未填写。', s ? 'structure' : 'summary');
  if (!Number.isInteger(content.duration) || content.duration <= 0) add('time', 'error', '课程时长无效', '课程时长须为正整数分钟。', 'overall');
  if (s) {
    const validMinutes = s.stages.every(stage => Number.isInteger(stage.minutes) && stage.minutes > 0);
    s.stages.forEach((stage, index) => {
      if (!Number.isInteger(stage.minutes) || stage.minutes <= 0) add('time', 'error', '环节时长缺失或无效', `${stage.title || '未命名环节'}：${String(stage.minutes)} 分钟。`, 'stage', index);
      else if (stage.minutes > content.duration * .7 && s.stages.length > 2) add('time', 'suggestion', '单个环节占时较多，请核对', `占课程 ${Math.round(stage.minutes / content.duration * 100)}%；这可能是合理的教学设计。`, 'stage', index, '结合授课实际核对，无须机械调整。', 'possible');
      if ([stage.title, stage.purpose, stage.activities, stage.explanation].some(blank)) add('completeness', 'warning', '关键环节内容空白', '标题、目的、活动或讲解尚未填写完整。', 'stage', index);
      if (new Set(stage.questionIds).size !== stage.questionIds.length) add('reference', 'error', '环节题目引用重复', '同一环节包含重复 Canonical ID。', 'stage', index);
      for (const id of stage.questionIds) if (!content.questions.some(q => q.canonicalId === id)) add('reference', 'error', '环节引用了已移除题目', `引用 ${id} 不在当前选题中。`, 'stage', index);
    });
    const sum = s.stages.reduce((n, stage) => n + stage.minutes, 0);
    if (validMinutes && sum !== content.duration) add('time', 'error', '环节总时长与课程不一致', `环节合计 ${sum} 分钟，课程 ${content.duration} 分钟，${sum > content.duration ? '超出' : '缺少'} ${Math.abs(sum - content.duration)} 分钟。`, 'structure');
    const seen = new Set<string>();
    s.examples.forEach(e => {
      if (seen.has(e.canonicalId) || !content.questions.some(q => q.canonicalId === e.canonicalId && q.revisionId === e.revisionId)) add('reference', 'error', '例题身份、版本或重复关联无效', `${e.canonicalId} / ${e.revisionId} 与当前选题不一致或重复。`, 'structure');
      seen.add(e.canonicalId);
    });
  }
  if (new Set(content.questions.map(q => q.canonicalId)).size !== content.questions.length) add('reference', 'error', '选题列表重复', '同一 Canonical 题目被重复选择。', 'examples');
  content.questions.forEach((q, index) => {
    if (s && !s.stages.some(stage => stage.questionIds.includes(q.canonicalId))) add('reference', 'warning', '题目尚未关联教学环节', `${q.canonicalId} 未安排到任何环节。`, 'question', index);
    if (q.purpose === '讲解' && (s ? !s.examples.some(e => e.canonicalId === q.canonicalId && e.revisionId === q.revisionId && !blank(e.arrangement) && !blank(e.keyIdeas)) : blank(content.examples))) add('completeness', 'warning', '例题缺少讲解安排', `选题 ${index + 1} 用于讲解，但未填写有效安排。`, 'question', index);
    const state = questions?.find(v => v.canonicalId === q.canonicalId && v.revisionId === q.revisionId);
    if (state?.invalid) add('reference', 'error', '固定题目引用不可用', '题目不存在、revision 不属于该题或当前无访问权限。', 'question', index);
    const status = state?.answerStatus;
    if (!status) add('answer', 'warning', '答案审核状态无法确定', '本地检查未读取题库审核记录，请运行服务端快速检查。', 'question', index, '读取题库状态后核对，不以教案内的审核标签为依据。', 'insufficient');
    else if (status !== 'reviewed') add('answer', 'warning', status === 'missing' ? '缺少可用参考答案与解析' : '已有解析尚未审核', status === 'missing' ? '题库未提供可用解析，不得视为标准答案。' : '题库解析未经教师审核，需重点核对。', 'question', index);
    const example = s?.examples.find(e => e.canonicalId === q.canonicalId);
    if (status && example && example.answerStatus !== status) add('answer', 'warning', '教案答案标签与题库状态不一致', `教案 ${example.answerStatus}，题库 ${status}；教案标签不会提升题库审核状态。`, 'question', index);
  });
  if (removedQuestions) add('reference', 'suggestion', '选题已变化，请核对旧题正文', '已观察到题目移除或固定版本替换；结构关联清理不能证明正文已更新。', 'examples', null, '逐段核对旧题讲解，或主动运行 AI 深度检查；此提示不判定正文引用错误。', 'possible');
  return { issues, snapshot: qualitySnapshot(content), revision, checkedAt: new Date().toISOString(), elapsedMs: performance.now() - start, aiRequests: 0 };
}

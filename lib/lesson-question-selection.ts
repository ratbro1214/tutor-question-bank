import type { Classification } from './classification';
import type { LessonContent } from './lesson-plan';

export type LibraryCandidate = { id: string; text: string; stage: string | null; identity_status: string; imageUrl: string | null; classification: Classification | null; sources: { title: string }[] };
export const defaultSelectionWeights = { knowledge: 4, difficulty: 2, type: 2, quality: 1, repetition: 5 };
export type SelectionWeights = typeof defaultSelectionWeights;
export function rankLessonCandidates(items: LibraryCandidate[], target: { knowledge: string; difficulty: string; type: string }, selected: { canonicalId: string; text: string }[], weights: SelectionWeights) {
  if (Object.values(weights).some(w => !Number.isFinite(w) || w < 0 || w > 100)) throw Error('推荐权重须在 0 至 100 之间。');
  const normalize = (s: string) => s.replace(/\s+/g, '').trim();
  return items.map(item => {
    let score = 0; const reasons: string[] = [];
    for (const key of ['knowledge', 'difficulty', 'type'] as const) {
      const match = key === 'knowledge' ? item.classification?.knowledge_points?.some(k => k.code === target.knowledge) : item.classification?.[key === 'type' ? 'question_type' : 'difficulty'] === target[key];
      if (target[key] && match) { score += weights[key]; reasons.push(({ knowledge: '匹配目标知识点', difficulty: '符合目标难度', type: '符合目标题型' })[key]); }
    }
    // These are recorded completeness signals, not a claim about mathematical correctness.
    if (item.identity_status === 'ready') { score += weights.quality; reasons.push('内容身份已就绪'); }
    if (item.imageUrl) { score += weights.quality; reasons.push('有原始题图'); }
    if (item.classification?.needs_review) reasons.push('分类仍待复核');
    const repeated = selected.some(s => s.canonicalId === item.id || (normalize(item.text).length > 20 && normalize(s.text).startsWith(normalize(item.text))));
    if (repeated) { score -= weights.repetition; reasons.push('教案已有同身份或相同题干，降低排序'); }
    return { item, score, reasons: reasons.length ? reasons : ['暂无目标匹配信号，请教师核对'] };
  }).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
}
export function selectLessonQuestion(questions: LessonContent['questions'], question: LessonContent['questions'][number], replaceId?: string) {
  if (questions.some(q => q.canonicalId === question.canonicalId && q.canonicalId !== replaceId)) throw Error('同一 Canonical 题目不能重复添加。');
  if (replaceId) {
    if (!questions.some(q => q.canonicalId === replaceId)) throw Error('待替换例题已移除，请重新选择。');
    return questions.map(q => q.canonicalId === replaceId ? { ...question, purpose: q.purpose, notes: q.notes } : q);
  }
  if (questions.length >= 30) throw Error('每份教案最多引用 30 道题。');
  return [...questions, question];
}
export function moveLessonQuestion(questions: LessonContent['questions'], index: number, offset: -1 | 1) {
  const next = [...questions], target = index + offset;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

import type { LessonStage } from './lesson-structure';

export function moveLessonStage(stages: LessonStage[], index: number, offset: -1 | 1) {
  const next = [...stages], target = index + offset;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function newLessonStage(): LessonStage {
  return { kind: '练习', title: '新教学环节', minutes: 1, purpose: '请填写教学目的', activities: '请填写教学活动', questionIds: [], explanation: '请填写讲解建议', followUps: ['请填写课堂追问'] };
}

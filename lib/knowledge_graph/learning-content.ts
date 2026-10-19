import catalog from '@/data/knowledge_graph/senior-math-v1.json';
import { setsFunctions } from '@/data/knowledge_graph/lessons/sets-functions';
import { trigSequenceVector } from '@/data/knowledge_graph/lessons/trig-sequence-vector';
import { inequalitySolid } from '@/data/knowledge_graph/lessons/inequality-solid';
import { analytic } from '@/data/knowledge_graph/lessons/analytic';
import { probability } from '@/data/knowledge_graph/lessons/probability';
import { derivativeComplex } from '@/data/knowledge_graph/lessons/derivative-complex';
import type { KnowledgeLesson, LessonSeed } from './learning-types';

export const lessonSeeds: Record<string, LessonSeed> = { ...setsFunctions, ...trigSequenceVector, ...inequalitySolid, ...analytic, ...probability, ...derivativeComplex };
const byId = new Map(catalog.nodes.map(n => [n.id, n]));
const byCode = new Map(catalog.nodes.map(n => [n.code, n]));
const parent = new Map<string, string>();
for (const edge of catalog.edges) {
  if (!['contains', 'belongs_to'].includes(edge.relation_type)) continue;
  const child = byId.get(edge.relation_type === 'contains' ? edge.target_id : edge.source_id);
  const ancestor = byId.get(edge.relation_type === 'contains' ? edge.source_id : edge.target_id);
  if (child && ancestor) parent.set(child.code, ancestor.code);
}
function path(code: string) {
  const result: string[] = [], seen = new Set<string>();
  for (let current: string | undefined = code; current && !seen.has(current); current = parent.get(current)) { result.push(current); seen.add(current); }
  return result;
}

/** Supplement the catalog without overwriting teacher-edited descriptions or review decisions. */
export function knowledgeLesson(code: string): KnowledgeLesson | null {
  const node = byCode.get(code);
  if (!node) return null;
  let seedCodes: string[];
  if (node.level >= 4) seedCodes = [node.level === 5 ? parent.get(code)! : code];
  else if (node.level === 1) seedCodes = ['FUNC.DOMAIN.E1', 'COMPLEX.CONCEPT.E2'];
  else {
    const descendants = Object.keys(lessonSeeds).filter(key => path(key).includes(code));
    // Concepts show both teaching points. Chapters show representative points from different concepts.
    seedCodes = node.level === 3 ? descendants : [...new Map(descendants.map(key => [parent.get(key), key])).values()].filter((_, i, all) => i === 0 || i === all.length - 1);
  }
  if (!seedCodes.length || seedCodes.some(key => !lessonSeeds[key])) return null;
  const explanation = node.level === 1
    ? ['高中数学用集合与逻辑描述对象和条件，用函数与导数刻画变化，用几何和向量研究位置，用概率统计处理不确定性。', '学习一个知识点时，先理解定义与适用条件，再联系公式、图形和例题；一个例子说明用法，但不能代替一般性证明。']
    : node.level === 2
      ? [node.description, '本章主要内容：' + catalog.nodes.filter(n => parent.get(n.code) === code).map(n => n.name).join('、') + '。']
      : [...new Set([node.description, ...seedCodes.map(key => lessonSeeds[key][0])])];
  return {
    code, title: node.name, version: 'senior-math-lessons-v1', reviewStatus: 'draft', explanation,
    examples: seedCodes.map(key => ({ focus: byCode.get(key)!.name, question: lessonSeeds[key][1], answer: lessonSeeds[key][2], steps: lessonSeeds[key][3] })),
  };
}

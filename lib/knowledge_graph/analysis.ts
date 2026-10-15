import { z } from 'zod';

const label = z.string().trim().min(1).max(120);
export const knowledgeAnalysisSchema = z.object({
  main_knowledge: label,
  secondary_knowledge: z.array(label).max(3),
  exam_point: z.string().trim().max(120),
  question_type: z.string().trim().max(120),
}).strict();
export type KnowledgeAnalysis = z.infer<typeof knowledgeAnalysisSchema>;
export const knowledgeAnalysisJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    main_knowledge: { type: 'string', minLength: 1, maxLength: 120 },
    secondary_knowledge: { type: 'array', maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 120 } },
    exam_point: { type: 'string', maxLength: 120 },
    question_type: { type: 'string', maxLength: 120 },
  },
  required: ['main_knowledge', 'secondary_knowledge', 'exam_point', 'question_type'],
} as const;

export const knowledgeAnalysisInstructions = '高中题额外输出 knowledge_graph：main_knowledge 为主要核心知识点名称，secondary_knowledge 为其他必需知识点名称（最多3个），exam_point 为具体考点，question_type 为具体数学任务（不是选择/填空版式）。不确定的考点或题型填空字符串，不编造。此结果仅供知识图谱待审核匹配，不代表已审核。';

// Exact matching only: normalize typography, never guess a semantically close label.
export function normalizeKnowledgeName(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').replaceAll('图像', '图象').toLowerCase();
}

export function analysisFromClassification(value: unknown): KnowledgeAnalysis | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Record<string, unknown>;
  if (c.education_stage !== '高中') return null;
  if (c.knowledge_graph !== undefined) {
    const parsed = knowledgeAnalysisSchema.safeParse(c.knowledge_graph);
    // Malformed graph output must never fall back to silently approving something else.
    return parsed.success ? parsed.data : null;
  }
  // Historical classifications have no fine-grained exam point. Keep it unknown.
  const points = z.array(z.object({ name: label })).min(1).max(4).safeParse(c.knowledge_points);
  return points.success ? { main_knowledge: points.data[0].name, secondary_knowledge: points.data.slice(1).map(p => p.name), exam_point: '', question_type: '' } : null;
}

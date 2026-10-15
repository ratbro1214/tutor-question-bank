import { z } from 'zod';
import { methodStrategySchema } from './method-strategy-schema';

export const graphStatus = z.enum(['candidate', 'approved', 'rejected']);
const line = z.string().trim().min(1).max(12000);
export const methodContentSchema = z.object({
  strategy: methodStrategySchema.optional(),
  signals: z.array(line).max(15).optional(), motivation: line.optional(), formulas: z.array(line).max(15).optional(),
  knowledgePoints: z.array(line).max(15).optional(), strategies: z.array(line).max(15).optional(),
  problemTypes: z.array(line).max(15).optional(), efficiency: line.optional(), teachingValue: line.optional(),
  name: line.max(160), summary: line, typicalProblems: z.array(line).max(15),
  conditions: z.array(line).min(1).max(15), steps: z.array(line).min(1).max(20),
  limitations: z.array(line).min(1).max(15), mistakes: z.array(line).max(15), variants: z.array(line).max(15),
}).strict();
export const evidenceSchema = z.object({
  canonicalId: z.string().min(1).max(160), revisionId: z.string().min(1).max(160),
  reviewId: z.string().min(1).max(160), matchRevision: z.number().int().positive(),
  fingerprint: z.string().min(1).max(160), model: z.string().max(160), promptVersion: z.string().max(160),
}).strict();
export const sourceSchema = z.object({ origin: z.enum(['manual', 'ai', 'pilot']), note: line.max(1000), evidence: evidenceSchema.nullable(), seedKey: z.string().max(160).optional() }).strict();
export const methodWriteSchema = z.object({
  operationId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), scopeId: z.string().min(1).max(160),
  status: graphStatus, content: methodContentSchema, source: sourceSchema,
}).strict();
export const relationWriteSchema = z.object({
  operationId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), scopeId: z.string().min(1).max(160),
  status: graphStatus, type: z.enum(['contains', 'prerequisite', 'related', 'applies', 'uses']),
  fromKnowledge: z.number().int().positive().nullable(), toKnowledge: z.number().int().positive().nullable(),
  methodId: z.string().min(1).max(160).nullable(), canonicalId: z.string().min(1).max(160).nullable(),
  revisionId: z.string().min(1).max(160).nullable(), source: sourceSchema,
}).strict().superRefine((r, ctx) => {
  const knowledge = ['contains', 'prerequisite', 'related'].includes(r.type);
  const valid = knowledge ? r.fromKnowledge && r.toKnowledge && r.fromKnowledge !== r.toKnowledge && !r.methodId && !r.canonicalId && !r.revisionId
    : r.type === 'applies' ? !r.fromKnowledge && r.toKnowledge && r.methodId && !r.canonicalId && !r.revisionId
    : !r.fromKnowledge && !r.toKnowledge && r.methodId && r.canonicalId && r.revisionId && r.source.evidence;
  if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '关系端点或已审核解法证据无效。' });
});
export type MethodContent = z.infer<typeof methodContentSchema>;
export type GraphSource = z.infer<typeof sourceSchema>;
export type MethodWrite = z.infer<typeof methodWriteSchema>;
export type RelationWrite = z.infer<typeof relationWriteSchema>;
export type GraphMethod = { id: string; scope_id: string; revision: number; status: z.infer<typeof graphStatus>; content: MethodContent; source: GraphSource; merged_into: string | null; updated_at: string; evidenceValid: boolean };
export type GraphRelation = { id: string; scope_id: string; revision: number; status: z.infer<typeof graphStatus>; type: RelationWrite['type']; from_knowledge: number | null; to_knowledge: number | null; method_id: string | null; method_name?: string; canonical_id: string | null; revision_id: string | null; source: GraphSource; reviewer: string | null; updated_at: string; evidenceValid: boolean };
export type GraphKnowledge = { id: number; code: string; name: string; chapter_code: string; chapter: string; stage: string; description: string | null };
export type GraphQuestion = { id: string; current_revision_id: string; original_text: string; classification: { knowledge_points?: { code: string; name: string }[] } | null; reviewed: boolean; methods: GraphRelation[] };
export type GraphSnapshot = { knowledge: GraphKnowledge[]; methods: GraphMethod[]; relations: GraphRelation[]; scopes: string[]; chapter: string; stage: string };

// Semantic identity includes the particular solution version, never just its method name.
export function relationKey(r: RelationWrite) {
  const endpoints = r.type === 'related' ? [r.fromKnowledge, r.toKnowledge].sort((a, b) => Number(a) - Number(b)) : [r.fromKnowledge, r.toKnowledge];
  return JSON.stringify([r.type, ...endpoints, r.methodId, r.canonicalId, r.revisionId, r.source.evidence?.reviewId || '', r.source.evidence?.matchRevision || 0]);
}
export function similarMethods(content: MethodContent, methods: GraphMethod[]) {
  const grams = (s: string) => new Set([...s.normalize('NFKC').replace(/\s/g, '')].flatMap((_, i, a) => i + 1 < a.length ? [a[i] + a[i + 1]] : []));
  const a = grams(content.name + content.conditions.join(''));
  return methods.map(m => { const b = grams(m.content.name + m.content.conditions.join('')); const union = new Set([...a, ...b]).size;
    return { id: m.id, name: m.content.name, score: union ? [...a].filter(g => b.has(g)).length / union : 0 };
  }).filter(m => m.score > .15).sort((a, b) => b.score - a.score).slice(0, 8);
}

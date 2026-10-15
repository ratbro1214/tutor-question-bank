import { z } from 'zod';

const line = z.string().trim().min(1).max(12000);
const lines = z.array(line).min(1).max(20);
export const strategyLinkLabels = { prerequisite: '先修方法', alternative: '可替代', combination: '可组合', boundary: '必须检查' } as const;
// Additive content migration: v1 cards omit strategy; v2 stays in math_methods.content.
// Links are part of the card's CAS revision and review history, never independent verified facts.
export const methodStrategySchema = z.object({
  version: z.literal(2), key: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  family: z.enum(['parameter', 'inequality']), parent: line,
  legacyNames: z.array(line).max(10), knowledgeCodes: lines, catalogCodes: lines,
  structure: lines, checks: lines,
  criticalMechanisms: z.array(z.object({ event: line, equation: line, consequence: line }).strict()).min(1).max(15),
  alternatives: z.array(z.object({ name: line, advantage: line, cost: line }).strict()).min(1).max(10),
  whySimpler: line, standardSolution: lines, teacherNotes: lines,
  examples: z.array(z.object({ statement: line, solution: line }).strict()).min(1).max(8),
  difficulty: z.number().int().min(1).max(5),
  links: z.array(z.object({ targetKey: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/), type: z.enum(['prerequisite', 'alternative', 'combination', 'boundary']), reason: line }).strict()).max(20),
}).strict().superRefine((s, ctx) => {
  const seen = new Set<string>();
  for (const link of s.links) {
    const key = `${link.type}:${link.targetKey}`;
    if (link.targetKey === s.key || seen.has(key)) ctx.addIssue({ code: 'custom', message: '方法关系不能自环或重复。' });
    seen.add(key);
  }
});
export type MethodStrategy = z.infer<typeof methodStrategySchema>;

import { z } from "zod";

// In-progress edits may temporarily have an empty answer or step title.
export const explanationDraftSchema = z.object({
  content: z.object({
    status: z.enum(["ready", "needs_context"]), answer: z.string(), approach: z.string(),
    steps: z.array(z.object({ title: z.string(), content: z.string() })),
    teachingNotes: z.string(), commonMistakes: z.string(), verification: z.string(), alternativeMethod: z.string(), missingInformation: z.string(),
  }),
  sourceText: z.string(), origin: z.enum(["ai", "manual"]), model: z.string(), reviewed: z.boolean(),
  baseRevision: z.number().int().nonnegative(),
});
export function explanationDraftKey(studentId: string, questionId: number) {
  return `question-explanation-draft:v1:${studentId}:${questionId}`;
}
export function readExplanationDraft(raw: string | null) {
  try { const parsed = explanationDraftSchema.safeParse(JSON.parse(raw || "null")); return parsed.success ? parsed.data : null; }
  catch { return null; }
}

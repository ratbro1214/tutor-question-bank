import { z } from "zod";

const paragraph = z.string().trim().max(6000);
export const explanationContentSchema = z.object({
  status: z.enum(["ready", "needs_context"]),
  answer: paragraph,
  approach: paragraph,
  steps: z.array(z.object({ title: z.string().trim().min(1).max(120), content: z.string().trim().min(1).max(6000) }).strict()).max(16),
  teachingNotes: paragraph,
  commonMistakes: paragraph,
  verification: paragraph,
  alternativeMethod: paragraph,
  missingInformation: z.string().trim().max(2000),
}).strict().superRefine((value, context) => {
  if (value.status === "ready" && (!value.answer || !value.approach || !value.steps.length))
    context.addIssue({ code: "custom", message: "请填写答案、解题思路和至少一个解题步骤。" });
  if (value.status === "needs_context" && !value.missingInformation)
    context.addIssue({ code: "custom", message: "请说明还需要补充哪些题目信息。" });
});
export type ExplanationContent = z.infer<typeof explanationContentSchema>;
export type SavedExplanation = {
  content: ExplanationContent; sourceText: string; revision: number;
  origin: "ai" | "manual" | "external"; model: string; reviewed: boolean; updatedAt: string;
};
export const emptyExplanation: ExplanationContent = {
  status: "ready", answer: "", approach: "", steps: [], teachingNotes: "",
  commonMistakes: "", verification: "", alternativeMethod: "", missingInformation: "",
};
export const explanationSaveSchema = z.object({
  studentId: z.number().int().positive(), expectedRevision: z.number().int().nonnegative(),
  sourceText: z.string().trim().min(1).max(16000), content: explanationContentSchema,
  reviewed: z.boolean(), origin: z.enum(["ai", "manual"]), model: z.string().trim().max(200),
}).strict().superRefine((value, context) => {
  if (value.reviewed && value.content.status !== "ready")
    context.addIssue({ code: "custom", message: "题目信息不完整时，请先补充信息再确认解析。" });
});

// One atomic statement protects both first-save and update races.
export const saveExplanationSql = `INSERT INTO question_explanations
  (question_id, content, source_text, revision, origin, model, reviewed, updated_at)
  SELECT ?, ?, ?, 1, ?, ?, ?, ?
  WHERE (? = 0 OR EXISTS (SELECT 1 FROM question_explanations WHERE question_id = ?))
    AND EXISTS (SELECT 1 FROM questions q JOIN students s ON s.id = q.student_id
      WHERE q.id = ? AND q.student_id = ? AND q.deleted_at IS NULL AND s.deleted_at IS NULL)
  ON CONFLICT(question_id) DO UPDATE SET
    content = excluded.content, source_text = excluded.source_text,
    revision = question_explanations.revision + 1, origin = excluded.origin,
    model = excluded.model, reviewed = excluded.reviewed, updated_at = excluded.updated_at
  WHERE question_explanations.revision = ?
  RETURNING *`;

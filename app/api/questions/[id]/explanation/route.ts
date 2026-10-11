import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, getD1Binding } from "@/db";
import { questions, students, questionExplanations } from "@/db/schema";
import { getBucket } from "@/lib/storage";
import { explanationSaveSchema, saveExplanationSql, type SavedExplanation } from "@/lib/question-explanation";
import { generateExplanation, ExplanationGenerationError, type ExplanationProvider } from "@/lib/explanation-generation";
import { configuredExplanationProvider } from "@/lib/ai-provider";
import type { Classification } from "@/lib/classification";

type Context = { params: Promise<{ id: string }> };
function positiveId(value: string | null) { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; }
async function findQuestion(questionId: number, studentId: number) {
  const [question] = await getDb().select({ id: questions.id, imageKey: questions.imageKey, extractedQuestion: questions.extractedQuestion, classification: questions.teacherConfirmedClassification })
    .from(questions).innerJoin(students, eq(students.id, questions.studentId))
    .where(and(eq(questions.id, questionId), eq(questions.studentId, studentId), isNull(questions.deletedAt), isNull(students.deletedAt))).limit(1);
  return question;
}
function publicExplanation(row: typeof questionExplanations.$inferSelect): SavedExplanation {
  return { content: JSON.parse(row.content), sourceText: row.sourceText, revision: row.revision, origin: row.origin as "ai" | "manual", model: row.model, reviewed: Boolean(row.reviewed), updatedAt: row.updatedAt };
}
function failure(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message || "解析内容不完整，请检查输入。" }, { status: 400 });
  if (error instanceof SyntaxError) return Response.json({ error: "请求格式无效。" }, { status: 400 });
  if (error instanceof ExplanationGenerationError) return Response.json({ error: error.message }, { status: error.status });
  console.error("question_explanation_failed", { name: error instanceof Error ? error.name : "UnknownError" });
  return Response.json({ error: "解析暂时无法读取或保存，请稍后重试。" }, { status: 500 });
}
function provider(): ExplanationProvider { return configuredExplanationProvider(env as unknown as Record<string, unknown>); }
export async function GET(request: Request, context: Context) {
  try {
    const questionId = positiveId((await context.params).id), studentId = positiveId(new URL(request.url).searchParams.get("studentId"));
    if (!questionId || !studentId) return Response.json({ error: "题目或学生编号无效。" }, { status: 400 });
    if (!await findQuestion(questionId, studentId)) return Response.json({ error: "没有找到该学生的题目。" }, { status: 404 });
    const [row] = await getDb().select().from(questionExplanations).where(eq(questionExplanations.questionId, questionId)).limit(1);
    return Response.json({ explanation: row ? publicExplanation(row) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
const generateInput = z.object({ studentId: z.number().int().positive(), questionText: z.string().trim().min(1).max(16000), expectedRevision: z.number().int().nonnegative().optional() }).strict();
export async function POST(request: Request, context: Context) {
  try {
    const questionId = positiveId((await context.params).id);
    if (!questionId) return Response.json({ error: "题目编号无效。" }, { status: 400 });
    const input = generateInput.parse(await request.json());
    const question = await findQuestion(questionId, input.studentId);
    if (!question) return Response.json({ error: "没有找到该学生的题目。" }, { status: 404 });
    const [previous] = await getDb().select().from(questionExplanations).where(eq(questionExplanations.questionId, questionId)).limit(1);
    const expectedRevision = input.expectedRevision ?? previous?.revision ?? 0;
    if (expectedRevision !== (previous?.revision ?? 0)) return Response.json({ error: "解析已在其他页面更新，请重新读取后再生成。" }, { status: 409 });
    const config = provider();
    if (!config.apiKey) throw new ExplanationGenerationError("尚未配置解题模型，可以先手工填写解析。", 503);
    const image = await getBucket().get(question.imageKey);
    if (!image) throw new ExplanationGenerationError("题目原图暂时无法读取，请恢复原图后再生成；也可以手工填写解析。", 422);
    if (image.size > 8 * 1024 * 1024) throw new ExplanationGenerationError("原图过大，请使用较小的题目图片；也可以手工填写解析。", 422);
    const mime = image.httpMetadata?.contentType || "image/png";
    const content = await generateExplanation({ questionText: input.questionText, educationStage: (JSON.parse(question.classification) as Classification).education_stage,
      imageDataUrl: `data:${mime};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}` }, config, request.signal);
    // Persist before responding; capture the revision to protect concurrent edits.
    const row = await getD1Binding().prepare(saveExplanationSql).bind(questionId, JSON.stringify(content), input.questionText, "ai", config.model, 0, new Date().toISOString(), expectedRevision, questionId, questionId, input.studentId, expectedRevision).first<{
      content: string; source_text: string; revision: number; origin: string; model: string; reviewed: number; updated_at: string;
    }>();
    if (!row) return Response.json({ content, model: config.model, sourceText: input.questionText, error: "生成期间解析已在其他页面更新，本次结果保存在本机草稿，请先核对服务器版本。" }, { status: 409 });
    const explanation: SavedExplanation = { content: JSON.parse(row.content), sourceText: row.source_text, revision: row.revision, origin: "ai", model: row.model, reviewed: false, updatedAt: row.updated_at };
    return Response.json({ content, origin: "ai", model: config.model, sourceText: input.questionText, explanation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    const questionId = positiveId((await context.params).id);
    if (!questionId) return Response.json({ error: "题目编号无效。" }, { status: 400 });
    const input = explanationSaveSchema.parse(await request.json());
    if (!await findQuestion(questionId, input.studentId)) return Response.json({ error: "没有找到该学生的题目。" }, { status: 404 });
    const result = await getD1Binding().prepare(saveExplanationSql).bind(questionId, JSON.stringify(input.content), input.sourceText, input.origin, input.origin === "ai" ? input.model : "", input.reviewed ? 1 : 0, new Date().toISOString(), input.expectedRevision, questionId, questionId, input.studentId, input.expectedRevision).first<{
      content: string; source_text: string; revision: number; origin: string; model: string; reviewed: number; updated_at: string;
    }>();
    if (!result) return Response.json({ error: "解析已在其他页面更新。当前输入仍然保留，请先复制修改内容，再刷新页面查看最新解析。" }, { status: 409 });
    return Response.json({ explanation: { content: JSON.parse(result.content), sourceText: result.source_text, revision: result.revision, origin: result.origin, model: result.model, reviewed: Boolean(result.reviewed), updatedAt: result.updated_at } });
  } catch (error) { return failure(error); }
}

import { env } from "cloudflare:workers";
import { getD1Binding } from "@/db";
import { getBucket } from "@/lib/storage";
import { findPaper, paperFailure, publicPaperQuestion, type PaperQuestionRow } from "@/lib/paper-server";
import { generateExplanation, ExplanationGenerationError, type ExplanationProvider } from "@/lib/explanation-generation";
import type { Classification } from "@/lib/classification";
import { POST as analyzeImage } from "@/app/api/analyze/route";
import { processPaperAnalysis } from '@/lib/paper-analysis';
import { syncPaperKnowledge } from '@/lib/knowledge_graph/server';

function provider(): ExplanationProvider {
  if (env.AI_PROVIDER === "deepseek") return { apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com", apiStyle: "chat_completions", model: env.DEEPSEEK_VISION_MODEL || "deepseek-flash", strictJsonSchema: false };
  return { apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1", apiStyle: env.OPENAI_API_STYLE || "responses", model: env.OPENAI_VISION_MODEL || "gpt-4o-mini", strictJsonSchema: true };
}
export async function POST(request: Request, context: { params: Promise<{ id: string; questionId: string }> }) {
  let token = "", questionId = "";
  try {
    const params = await context.params; questionId = params.questionId;
    if (!await findPaper(params.id,request,true)) return Response.json({ error: "套卷不存在。" }, { status: 404 });
    const db = getD1Binding(), row = await db.prepare("SELECT * FROM paper_questions WHERE id=? AND paper_id=?").bind(questionId, params.id).first<PaperQuestionRow>();
    if (!row) return Response.json({ error: "套卷题目不存在。" }, { status: 404 });
    const input = await request.json() as { educationStage?: string; regenerate?: boolean; operationId?: string; cancel?: boolean; mode?: string };
    if (input.mode !== undefined && !['classify','explain'].includes(input.mode)) return Response.json({ error: '处理方式无效。' }, { status: 400 });
    const mode = input.mode === 'classify' ? 'classify' : 'explain';
    if (input.operationId && !/^[0-9a-f-]{36}$/i.test(input.operationId)) return Response.json({ error: "解析任务编号无效。" }, { status: 400 });
    if (input.cancel) {
      if (!input.operationId) return Response.json({ error: "缺少要停止的任务编号。" }, { status: 400 });
      await db.prepare("UPDATE paper_questions SET status=CASE WHEN explanation IS NULL AND classification IS NULL THEN 'pending' ELSE 'ready' END,error='本次处理已停止，可以重新开始；已有分类和解析保留。',generation_token=NULL,updated_at=? WHERE id=? AND generation_token=?").bind(new Date().toISOString(), questionId, input.operationId).run();
      const current = await db.prepare("SELECT * FROM paper_questions WHERE id=?").bind(questionId).first<PaperQuestionRow>();
      return Response.json({ question: publicPaperQuestion(current!) });
    }
    const stage = input.educationStage === "初中" ? "初中" : "高中";
    if (mode === 'classify' && row.classification && JSON.parse(row.classification).education_stage === stage && row.status !== 'processing' && !row.error && !input.regenerate) return Response.json({ question: publicPaperQuestion(row), reused: true, knowledgeGraph: await syncPaperKnowledge(request, questionId) });
    if (mode === 'explain' && row.explanation && row.status === "ready" && !row.error && !input.regenerate) return Response.json({ question: publicPaperQuestion(row), reused: true });
    const config = provider();
    if (!config.apiKey) throw new ExplanationGenerationError("尚未配置 AI 分类/解题模型。", 503);
    token = input.operationId || crypto.randomUUID();
    const locked = await db.prepare("UPDATE paper_questions SET status='processing',error='',generation_token=?,updated_at=? WHERE id=? AND (status<>'processing' OR updated_at<?) RETURNING id").bind(token, new Date().toISOString(), questionId, new Date(Date.now() - 8 * 60 * 1000).toISOString()).first();
    if (!locked) { token = ""; return Response.json({ error: "此题正在处理，请稍后刷新；中断的任务可在 8 分钟后重试。" }, { status: 409 }); }
    const image = await getBucket().get(row.image_key);
    if (!image) throw new ExplanationGenerationError("题目裁切图无法读取，请重新裁切。", 422);
    const bytes = await image.arrayBuffer(), mime = image.httpMetadata?.contentType || "image/jpeg";
    const result = await processPaperAnalysis({ mode, educationStage: stage,
     classification: row.classification && !(mode === 'classify' && input.regenerate) ? JSON.parse(row.classification) as Classification : null,
     classify: async () => {
      let classification: Classification | null = null;
      const form = new FormData(); form.set("image", new File([bytes], "question.jpg", { type: mime })); form.set("educationStage", stage); form.set('reasoningEffort', 'low');
      const response = await analyzeImage(new Request("http://local/api/analyze", { method: "POST", body: form, signal: request.signal }));
      if (!response.ok) throw new ExplanationGenerationError("题目识别失败，请检查裁切后重试。");
      for (const line of (await response.text()).split("\n").filter(Boolean)) {
        const event = JSON.parse(line);
        if (event.type === "error") throw new ExplanationGenerationError(event.error);
        if (event.type === "complete") {
          if (event.mode !== "live") throw new ExplanationGenerationError("模型尚未配置，无法生成真实解析。", 503);
          classification = event.classification;
        }
      }
      if (!classification) throw new ExplanationGenerationError("题目识别未返回完整结果，请重试。");
      // Save classification independently so a later optional explanation can reuse it.
      const classified = await db.prepare("UPDATE paper_questions SET classification=?,revision=revision+1 WHERE id=? AND generation_token=? RETURNING id").bind(JSON.stringify(classification), questionId, token).first();
      if (!classified) throw new ExplanationGenerationError('处理已停止或题目已变化，分类未覆盖。', 409);
      return classification;
     },
     explain: classification => generateExplanation({ questionText: classification.extracted_question || row.question_text, educationStage: stage, imageDataUrl: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` }, config, request.signal),
    });
    const saved = mode === 'classify'
     ? await db.prepare("UPDATE paper_questions SET status='ready',error='',generation_token=NULL,updated_at=? WHERE id=? AND generation_token=? RETURNING *").bind(new Date().toISOString(), questionId, token).first<PaperQuestionRow>()
     : await db.prepare("UPDATE paper_questions SET explanation=?,model=?,revision=revision+1,status='ready',error='',generation_token=NULL,updated_at=? WHERE id=? AND generation_token=? RETURNING *").bind(JSON.stringify(result.content), config.model, new Date().toISOString(), questionId, token).first<PaperQuestionRow>();
    if (!saved) return Response.json({ error: "解析任务已更新，请重新读取。" }, { status: 409 });
    return Response.json({ question: publicPaperQuestion(saved), knowledgeGraph: await syncPaperKnowledge(request, questionId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof ExplanationGenerationError ? error.message : "此题处理失败，请稍后重试。";
    if (token && questionId) await getD1Binding().prepare("UPDATE paper_questions SET status=CASE WHEN explanation IS NULL AND classification IS NULL THEN 'failed' ELSE 'ready' END,error=?,generation_token=NULL,updated_at=? WHERE id=? AND generation_token=?").bind(message, new Date().toISOString(), questionId, token).run().catch(() => {});
    if (error instanceof ExplanationGenerationError) return Response.json({ error: message }, { status: error.status });
    return paperFailure(error);
  }
}

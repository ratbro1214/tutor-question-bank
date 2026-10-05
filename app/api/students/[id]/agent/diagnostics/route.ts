import { env } from "cloudflare:workers";
import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { diagnosticItems, diagnosticPlans, knowledgePoints, questionKnowledgePoints, questions, students } from "@/db/schema";
import { readLearning } from "@/app/api/students/[id]/learning/route";
import { errorPatternByCode } from "@/lib/learning";
import { buildTeachingAgentPlan } from "@/lib/teaching-agent";
import {
  fallbackDiagnosticPackage,
  generateDiagnosticPackage,
  materializeDiagnosticItems,
  type DiagnosticGenerationContext,
  type DiagnosticProviderConfig,
} from "@/lib/diagnostic-generation";

const planStatuses = ["draft", "adopted", "dismissed"] as const;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const studentId = Number((await context.params).id);
  if (!Number.isSafeInteger(studentId) || studentId < 1)
    return Response.json({ error: "学生编号无效。" }, { status: 400 });
  try {
    const rows = await getDb().select({
      id: diagnosticPlans.id,
      actionId: diagnosticPlans.actionId,
      questionId: diagnosticPlans.questionId,
      sourceAttemptId: diagnosticPlans.sourceAttemptId,
      knowledgePointCode: diagnosticPlans.knowledgePointCode,
      content: diagnosticPlans.content,
      mode: diagnosticPlans.generationMode,
      status: diagnosticPlans.status,
      createdAt: diagnosticPlans.createdAt,
      decidedAt: diagnosticPlans.decidedAt,
    }).from(diagnosticPlans)
      .innerJoin(questions, eq(questions.id, diagnosticPlans.questionId))
      .innerJoin(students, eq(students.id, questions.studentId))
      .where(and(eq(questions.studentId, studentId), isNull(questions.deletedAt), isNull(students.deletedAt)))
      .orderBy(desc(diagnosticPlans.createdAt));
    const items = rows.length ? await getDb().select().from(diagnosticItems)
      .where(inArray(diagnosticItems.planId, rows.map((row) => row.id))) : [];
    return Response.json({
      plans: rows.map((row) => ({ ...row, package: JSON.parse(row.content), content: undefined,
        items: items.filter((item) => item.planId === row.id).sort((a, b) => a.position - b.position)
          .map((item) => ({ ...JSON.parse(item.content), id: item.id, position: item.position })),
      })),
    });
  } catch (error) {
    console.error("diagnostic_plans_load_failed", error);
    return Response.json({ error: "诊断方案加载失败，请检查数据库迁移。" }, { status: 500 });
  }
}

function providerConfig(): DiagnosticProviderConfig {
  if (env.AI_PROVIDER === "deepseek") return {
    apiKey: env.DEEPSEEK_API_KEY,
    baseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    apiStyle: "chat_completions",
    model: env.DEEPSEEK_CLASSIFICATION_MODEL || "deepseek-v4-pro",
    strictJsonSchema: false,
  };
  return {
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiStyle: env.OPENAI_API_STYLE || "responses",
    model: env.OPENAI_CLASSIFICATION_MODEL || env.OPENAI_VISION_MODEL || "gpt-4o-mini",
    strictJsonSchema: true,
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const studentId = Number((await context.params).id);
  if (!Number.isSafeInteger(studentId) || studentId < 1)
    return Response.json({ error: "学生编号无效。" }, { status: 400 });
  const body = await request.json().catch(() => null) as { actionId?: unknown; questionId?: unknown } | null;
  const actionId = typeof body?.actionId === "string" ? body.actionId : "";
  const questionId = Number(body?.questionId);
  if (!actionId || !Number.isSafeInteger(questionId) || questionId < 1)
    return Response.json({ error: "诊断任务无效。" }, { status: 400 });

  try {
    const db = getDb();
    const rows = await db.select({
      id: questions.id,
      extractedQuestion: questions.extractedQuestion,
      chapterName: questions.chapterName,
      teacherConfirmedClassification: questions.teacherConfirmedClassification,
      knowledgeCode: knowledgePoints.code,
      knowledgeName: knowledgePoints.name,
    }).from(questions)
      .leftJoin(questionKnowledgePoints, eq(questionKnowledgePoints.questionId, questions.id))
      .leftJoin(knowledgePoints, eq(knowledgePoints.id, questionKnowledgePoints.knowledgePointId))
      .innerJoin(students, eq(students.id, questions.studentId))
      .where(and(eq(questions.id, questionId), eq(questions.studentId, studentId), isNull(questions.deletedAt), isNull(students.deletedAt)));
    if (!rows.length) return Response.json({ error: "题目不存在或不属于当前学生。" }, { status: 404 });

    const learning = await readLearning(studentId);
    const question = {
      id: rows[0].id,
      chapterName: rows[0].chapterName,
      extractedQuestion: rows[0].extractedQuestion,
      knowledgePoints: rows.flatMap((row) => row.knowledgeCode && row.knowledgeName ? [{ code: row.knowledgeCode, name: row.knowledgeName }] : []),
    };
    const action = buildTeachingAgentPlan([question], learning.events).actions.find((item) => item.id === actionId && item.kind === "diagnose" && item.questionId === questionId);
    if (!action) return Response.json({ error: "该诊断建议已变化，请刷新后重试。" }, { status: 409 });
    const attemptId = action.evidence[0]?.eventId;
    const attempt = learning.events.find((event) => event.id === attemptId && event.kind === "attempt");
    if (!attempt) return Response.json({ error: "没有找到生成诊断题所需的作答证据。" }, { status: 409 });
    const confirmed = JSON.parse(rows[0].teacherConfirmedClassification) as { education_stage?: string };
    const generationContext: DiagnosticGenerationContext = {
      educationStage: confirmed.education_stage || "中学",
      chapterName: question.chapterName,
      knowledgePointName: action.knowledgePointName || attempt.knowledgePointCode || "未标注知识点",
      originalQuestion: question.extractedQuestion,
      studentResponse: attempt.responseText || "",
      correctness: attempt.correctness || "未记录",
      supportLevel: attempt.supportLevel || "未记录",
      evidenceLevel: attempt.evidenceLevel || "仅有最终答案",
      evidenceSource: attempt.evidenceSource || "其他",
      candidateErrors: (attempt.candidateErrorCodes || []).map((code) => errorPatternByCode(code)?.label).filter((label): label is string => Boolean(label)),
      ruleQuestions: action.suggestedSteps,
    };
    let generated;
    let warning: string | undefined;
    try {
      generated = await generateDiagnosticPackage(generationContext, providerConfig());
    } catch {
      generated = { package: fallbackDiagnosticPackage(generationContext), mode: "fallback" as const };
      warning = "生成模型暂时不可用，已返回规则版诊断。";
    }
    const plan = {
        id: crypto.randomUUID(),
        questionId,
        sourceAttemptId: attempt.id,
        actionId: action.id,
        knowledgePointCode: attempt.knowledgePointCode || "",
        content: JSON.stringify(generated.package),
        generationMode: generated.mode,
        status: "draft",
        createdAt: new Date().toISOString(),
      };
    const items = materializeDiagnosticItems(plan.id, generated.package);
    await db.batch([db.insert(diagnosticPlans).values(plan), db.insert(diagnosticItems).values(items)]);
    return Response.json({ ...generated, warning, plan: { id: plan.id, status: plan.status, createdAt: plan.createdAt } });
  } catch (error) {
    console.error("diagnostic_generation_failed", error);
    return Response.json({ error: "诊断任务生成失败，请稍后重试。" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const studentId = Number((await context.params).id);
  if (!Number.isSafeInteger(studentId) || studentId < 1)
    return Response.json({ error: "学生编号无效。" }, { status: 400 });
  const body = await request.json().catch(() => null) as { planId?: unknown; status?: unknown } | null;
  const planId = typeof body?.planId === "string" ? body.planId : "";
  const status = typeof body?.status === "string" ? body.status : "";
  if (!planId || !planStatuses.includes(status as (typeof planStatuses)[number]) || status === "draft")
    return Response.json({ error: "诊断方案操作无效。" }, { status: 400 });
  try {
    const db = getDb();
    const [owned] = await db.select({ id: diagnosticPlans.id, status: diagnosticPlans.status, decidedAt: diagnosticPlans.decidedAt })
      .from(diagnosticPlans)
      .innerJoin(questions, eq(questions.id, diagnosticPlans.questionId))
      .innerJoin(students, eq(students.id, questions.studentId))
      .where(and(eq(diagnosticPlans.id, planId), eq(questions.studentId, studentId), isNull(questions.deletedAt), isNull(students.deletedAt)))
      .limit(1);
    if (!owned) return Response.json({ error: "诊断方案不存在。" }, { status: 404 });
    if (owned.status !== "draft") {
      if (owned.status === status) return Response.json({ plan: { id: planId, status, decidedAt: owned.decidedAt } });
      return Response.json({ error: "诊断方案已经处理，不能重复更改。" }, { status: 409 });
    }
    const decidedAt = new Date().toISOString();
    await db.update(diagnosticPlans).set({ status, decidedAt }).where(and(eq(diagnosticPlans.id, planId), eq(diagnosticPlans.status, "draft")));
    const [result] = await db.select({ status: diagnosticPlans.status, decidedAt: diagnosticPlans.decidedAt }).from(diagnosticPlans).where(eq(diagnosticPlans.id, planId));
    if (result.status !== status) return Response.json({ error: "诊断方案已由另一操作处理，请刷新。" }, { status: 409 });
    return Response.json({ plan: { id: planId, ...result } });
  } catch (error) {
    console.error("diagnostic_plan_decision_failed", error);
    return Response.json({ error: "诊断方案状态保存失败。" }, { status: 500 });
  }
}

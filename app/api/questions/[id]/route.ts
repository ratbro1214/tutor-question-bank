import { and, eq, isNull } from "drizzle-orm";
import { getD1Binding, getDb } from "@/db";
import { questions } from "@/db/schema";
import { apiError } from "@/lib/api-error";
import { normalizeClassificationTags, questionTypes, subjectForStage, taxonomyVersionForStage, validateClassification, type Classification } from "@/lib/classification";
import { chapterName, chaptersForStage, taxonomyForStage } from "@/lib/taxonomy";

function parseQuestionId(id: string) {
  const questionId = Number(id);
  return Number.isInteger(questionId) && questionId > 0 ? questionId : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const questionId = parseQuestionId(id);
    if (!questionId) return Response.json({ error: "题目编号无效。" }, { status: 400 });

    const submitted = await request.json() as { teacherConfirmedClassification?: Classification; expectedClassification?: string };
    const submittedDraft = submitted.teacherConfirmedClassification;
    if (!submittedDraft) return Response.json({error:"缺少分类数据"},{status:400});
    const draft = normalizeClassificationTags(submittedDraft);
    const validationIssues = validateClassification(draft);
    if (validationIssues.length) return Response.json({
      error: "分类数据存在标签冲突，请核对主章节、题型和核心知识点。",
      validationIssues,
    }, { status: 400 });
    if (!draft.extracted_question.trim()) return Response.json({ error: "题目原文不能为空。" }, { status: 400 });
    const stageChapters = chaptersForStage(draft.education_stage);
    const stageTaxonomy = taxonomyForStage(draft.education_stage);
    if (!stageChapters.some(([code]) => code === draft.chapter.code)) return Response.json({ error: "请选择当前学段中的有效主章节。" }, { status: 400 });
    if (!questionTypes.includes(draft.question_type as (typeof questionTypes)[number])) return Response.json({ error: "请选择有效的题型。" }, { status: 400 });
    if (draft.knowledge_points.length < 1 || draft.knowledge_points.length > 4) return Response.json({ error: "请选择 1–4 个核心知识点。" }, { status: 400 });

    const canonicalPoints = draft.knowledge_points.map((point) => stageTaxonomy.find(([code]) => code === point.code));
    if (canonicalPoints.some((point) => !point)) return Response.json({ error: "知识点不在统一目录中。" }, { status: 400 });
    const canonicalMethods = draft.methods.map((method) => stageTaxonomy.find(([code, , owner]) => code === method.code && owner === "METHOD"));
    if (canonicalMethods.some((method) => !method)) return Response.json({ error: "数学思想或方法不在统一目录中。" }, { status: 400 });

    const confirmed: Classification = {
      ...draft,
      subject: subjectForStage(draft.education_stage),
      taxonomy_version: taxonomyVersionForStage(draft.education_stage),
      chapter: { code: draft.chapter.code, name: chapterName(draft.chapter.code) },
      knowledge_points: canonicalPoints.map((point) => ({ code: point![0], name: point![1] })),
      methods: canonicalMethods.map((method) => ({ code: method![0], name: method![1] })),
      needs_review: false,
      review_reasons: [],
    };

    const db = getDb();
    const [existing] = await db.select({ id: questions.id }).from(questions).where(and(eq(questions.id, questionId), isNull(questions.deletedAt))).limit(1);
    if (!existing) return Response.json({ error: "没有找到该题目。" }, { status: 404 });

    const expected = submitted.expectedClassification;
    if (!expected) return Response.json({error:"请刷新题目后重试。"},{status:409});
    const binding = getD1Binding();
    const statements: D1PreparedStatement[] = [];
    for (const point of canonicalPoints) {
      statements.push(binding.prepare(`
        INSERT INTO knowledge_points (code, name, chapter_code)
        VALUES (?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET name = excluded.name, chapter_code = excluded.chapter_code
      `).bind(point![0], point![1], point![2]));
    }
    statements.push(binding.prepare("DELETE FROM question_knowledge_points WHERE question_id = ? AND EXISTS (SELECT 1 FROM questions WHERE id=? AND teacher_confirmed_classification=? AND deleted_at IS NULL)").bind(questionId, questionId, expected));
    for (const point of canonicalPoints) {
      statements.push(binding.prepare(`
        INSERT INTO question_knowledge_points (question_id, knowledge_point_id)
        SELECT ?, id FROM knowledge_points WHERE code = ? AND EXISTS (SELECT 1 FROM questions WHERE id=? AND teacher_confirmed_classification=? AND deleted_at IS NULL)
        ON CONFLICT(question_id, knowledge_point_id) DO NOTHING
      `).bind(questionId, point![0], questionId, expected));
    }
    statements.push(binding.prepare(`
      UPDATE questions
      SET extracted_question = ?, chapter_code = ?, chapter_name = ?, question_type = ?, difficulty = ?,
          teacher_confirmed_classification = ?, confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND teacher_confirmed_classification = ? AND deleted_at IS NULL
    `).bind(
      confirmed.extracted_question, confirmed.chapter.code, confirmed.chapter.name,
      confirmed.question_type, confirmed.difficulty, JSON.stringify(confirmed), questionId, expected,
    ));
    const results = await binding.batch(statements);
    if (!results.at(-1)?.meta.changes) return Response.json({error:"题目已被其他操作修改，请重新打开后再保存。"},{status:409});

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const questionId = parseQuestionId(id);
    if (!questionId) return Response.json({ error: "题目编号无效。" }, { status: 400 });

    const db = getDb();
    const [existing] = await db.select({ id: questions.id }).from(questions).where(and(eq(questions.id, questionId), isNull(questions.deletedAt))).limit(1);
    if (!existing) return Response.json({ error: "没有找到该题目。" }, { status: 404 });
    await db.update(questions).set({ deletedAt: new Date().toISOString() }).where(eq(questions.id, questionId));

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}


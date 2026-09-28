import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { knowledgePoints, questionKnowledgePoints, questions, students } from "@/db/schema";
import { apiError } from "@/lib/api-error";
import { normalizeClassificationTags, type Classification } from "@/lib/classification";
import { isMethodCode } from "@/lib/taxonomy";

function parseStudentId(id: string) {
  const studentId = Number(id);
  return Number.isInteger(studentId) && studentId > 0 ? studentId : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const studentId = parseStudentId(id);
    if (!studentId) return Response.json({ error: "学生编号无效。" }, { status: 400 });
    const db = getDb();
    const [student] = await db.select().from(students).where(and(eq(students.id, studentId), isNull(students.deletedAt))).limit(1);
    if (!student) return Response.json({ error: "没有找到该学生。" }, { status: 404 });

    const rows = await db.select({
      id: questions.id, extractedQuestion: questions.extractedQuestion, chapterCode: questions.chapterCode,
      chapterName: questions.chapterName, questionType: questions.questionType, difficulty: questions.difficulty,
      createdAt: questions.createdAt, imageKey: questions.imageKey, knowledgeCode: knowledgePoints.code,
      knowledgeName: knowledgePoints.name, aiClassification: questions.aiClassification,
      classificationSource: questions.classificationSource,
      teacherConfirmedClassification: questions.teacherConfirmedClassification,
    }).from(questions)
      .leftJoin(questionKnowledgePoints, eq(questionKnowledgePoints.questionId, questions.id))
      .leftJoin(knowledgePoints, eq(knowledgePoints.id, questionKnowledgePoints.knowledgePointId))
      .where(and(eq(questions.studentId, studentId), isNull(questions.deletedAt))).orderBy(desc(questions.createdAt));

    const grouped = new Map<number, {
      id: number; extractedQuestion: string; chapterCode: string; chapterName: string; questionType: string;
      difficulty: string; createdAt: string; imageUrl: string; knowledgePoints: { code: string; name: string }[];
      methods: { code: string; name: string }[];
      aiClassification: Classification | null; classificationSource: string; teacherConfirmedClassification: Classification;
    }>();
    for (const row of rows) {
      if (!grouped.has(row.id)) grouped.set(row.id, {
        id: row.id, extractedQuestion: row.extractedQuestion, chapterCode: row.chapterCode,
        chapterName: row.chapterName, questionType: row.questionType, difficulty: row.difficulty,
        createdAt: row.createdAt, imageUrl: `/api/images/${encodeURIComponent(row.imageKey)}`, knowledgePoints: [], methods: [],
        aiClassification: JSON.parse(row.aiClassification) as Classification | null,
        classificationSource: row.classificationSource,
        teacherConfirmedClassification: JSON.parse(row.teacherConfirmedClassification) as Classification,
      });
      if (row.knowledgeCode && row.knowledgeName) grouped.get(row.id)!.knowledgePoints.push({ code: row.knowledgeCode, name: row.knowledgeName });
    }
    for (const question of grouped.values()) {
      question.teacherConfirmedClassification = normalizeClassificationTags(question.teacherConfirmedClassification);
      question.aiClassification = question.aiClassification ? normalizeClassificationTags(question.aiClassification) : null;
      const stage = question.teacherConfirmedClassification.education_stage;
      const legacyMethods = question.knowledgePoints.filter(point => isMethodCode(stage, point.code));
      question.knowledgePoints = question.knowledgePoints.filter(point => !isMethodCode(stage, point.code));
      question.methods = [...new Map(
        [...legacyMethods, ...question.teacherConfirmedClassification.methods].map(point => [point.code, point]),
      ).values()];
    }
    return Response.json({ student, questions: [...grouped.values()] });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const studentId = parseStudentId(id);
    if (!studentId) return Response.json({ error: "学生编号无效。" }, { status: 400 });

    const db = getDb();
    const [student] = await db.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), isNull(students.deletedAt))).limit(1);
    if (!student) return Response.json({ error: "没有找到该学生。" }, { status: 404 });
    const deletedAt = new Date().toISOString();
    await db.update(questions).set({ deletedAt }).where(and(eq(questions.studentId, studentId), isNull(questions.deletedAt)));
    await db.update(students).set({ deletedAt, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(students.id, studentId));

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const studentId = parseStudentId(id);
    if (!studentId) return Response.json({ error: "学生编号无效。" }, { status: 400 });
    const payload = await request.json() as { name?: string; grade?: string; notes?: string };
    const name = payload.name?.trim();
    if (!name) return Response.json({ error: "请填写学生姓名。" }, { status: 400 });
    const db = getDb();
    const [student] = await db.update(students).set({
      name,
      grade: payload.grade?.trim() || "初中",
      notes: payload.notes?.trim() || "",
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(and(eq(students.id, studentId), isNull(students.deletedAt))).returning();
    if (!student) return Response.json({ error: "没有找到该学生。" }, { status: 404 });
    return Response.json({ student });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

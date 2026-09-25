import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { knowledgePoints, questionKnowledgePoints, questions, students } from "@/db/schema";
import { apiError } from "@/lib/api-error";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const studentId = Number(id);
    if (!Number.isInteger(studentId)) return Response.json({ error: "学生编号无效。" }, { status: 400 });
    const db = getDb();
    const [student] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
    if (!student) return Response.json({ error: "没有找到该学生。" }, { status: 404 });

    const rows = await db.select({
      id: questions.id, extractedQuestion: questions.extractedQuestion, chapterCode: questions.chapterCode,
      chapterName: questions.chapterName, questionType: questions.questionType, difficulty: questions.difficulty,
      createdAt: questions.createdAt, imageKey: questions.imageKey, knowledgeCode: knowledgePoints.code,
      knowledgeName: knowledgePoints.name,
    }).from(questions)
      .leftJoin(questionKnowledgePoints, eq(questionKnowledgePoints.questionId, questions.id))
      .leftJoin(knowledgePoints, eq(knowledgePoints.id, questionKnowledgePoints.knowledgePointId))
      .where(eq(questions.studentId, studentId)).orderBy(desc(questions.createdAt));

    const grouped = new Map<number, {
      id: number; extractedQuestion: string; chapterCode: string; chapterName: string; questionType: string;
      difficulty: string; createdAt: string; imageUrl: string; knowledgePoints: { code: string; name: string }[];
    }>();
    for (const row of rows) {
      if (!grouped.has(row.id)) grouped.set(row.id, {
        id: row.id, extractedQuestion: row.extractedQuestion, chapterCode: row.chapterCode,
        chapterName: row.chapterName, questionType: row.questionType, difficulty: row.difficulty,
        createdAt: row.createdAt, imageUrl: `/api/images/${encodeURIComponent(row.imageKey)}`, knowledgePoints: [],
      });
      if (row.knowledgeCode && row.knowledgeName) grouped.get(row.id)!.knowledgePoints.push({ code: row.knowledgeCode, name: row.knowledgeName });
    }
    return Response.json({ student, questions: [...grouped.values()] });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

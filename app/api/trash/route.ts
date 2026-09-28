import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getD1Binding, getDb } from "@/db";
import { questions, students } from "@/db/schema";
import { apiError } from "@/lib/api-error";
import { getBucket } from "@/lib/storage";

type TrashTarget = { type?: "student" | "question"; id?: number };

function validTarget(payload: TrashTarget) {
  return (payload.type === "student" || payload.type === "question") && Number.isInteger(payload.id) && Number(payload.id) > 0;
}

export async function GET() {
  try {
    const db = getDb();
    const deletedStudents = await db.select({
      id: students.id, name: students.name, grade: students.grade, deletedAt: students.deletedAt,
    }).from(students).where(isNotNull(students.deletedAt)).orderBy(desc(students.deletedAt));
    const deletedQuestions = await db.select({
      id: questions.id, studentName: students.name, chapterName: questions.chapterName,
      originalFilename: questions.originalFilename, deletedAt: questions.deletedAt,
    }).from(questions).innerJoin(students, eq(students.id, questions.studentId))
      .where(and(isNotNull(questions.deletedAt), isNull(students.deletedAt))).orderBy(desc(questions.deletedAt));
    return Response.json({ students: deletedStudents, questions: deletedQuestions });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as TrashTarget;
    if (!validTarget(payload)) return Response.json({ error: "回收站项目无效。" }, { status: 400 });
    const db = getDb();
    if (payload.type === "student") {
      const [restored] = await db.update(students).set({ deletedAt: null }).where(eq(students.id, payload.id!)).returning({ id: students.id });
      if (!restored) return Response.json({ error: "没有找到该学生。" }, { status: 404 });
      await db.update(questions).set({ deletedAt: null }).where(eq(questions.studentId, payload.id!));
    } else {
      const [item] = await db.select({ id: questions.id, studentDeletedAt: students.deletedAt }).from(questions)
        .innerJoin(students, eq(students.id, questions.studentId)).where(eq(questions.id, payload.id!)).limit(1);
      if (!item) return Response.json({ error: "没有找到该题目。" }, { status: 404 });
      if (item.studentDeletedAt) return Response.json({ error: "请先恢复该题目所属的学生。" }, { status: 409 });
      await db.update(questions).set({ deletedAt: null }).where(eq(questions.id, payload.id!));
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as TrashTarget;
    if (!validTarget(payload)) return Response.json({ error: "回收站项目无效。" }, { status: 400 });
    const db = getDb();
    const binding = getD1Binding();
    let imageKeys: string[] = [];
    if (payload.type === "student") {
      imageKeys = (await db.select({ imageKey: questions.imageKey }).from(questions).where(eq(questions.studentId, payload.id!))).map(item => item.imageKey);
      await binding.batch([
        binding.prepare("DELETE FROM question_knowledge_points WHERE question_id IN (SELECT id FROM questions WHERE student_id = ?)").bind(payload.id),
        binding.prepare("DELETE FROM questions WHERE student_id = ?").bind(payload.id),
        binding.prepare("DELETE FROM students WHERE id = ? AND deleted_at IS NOT NULL").bind(payload.id),
      ]);
    } else {
      const [item] = await db.select({ imageKey: questions.imageKey }).from(questions).where(and(eq(questions.id, payload.id!), isNotNull(questions.deletedAt))).limit(1);
      if (!item) return Response.json({ error: "没有找到该题目。" }, { status: 404 });
      imageKeys = [item.imageKey];
      await binding.batch([
        binding.prepare("DELETE FROM question_knowledge_points WHERE question_id = ?").bind(payload.id),
        binding.prepare("DELETE FROM questions WHERE id = ? AND deleted_at IS NOT NULL").bind(payload.id),
      ]);
    }
    const bucket = getBucket();
    await Promise.allSettled(imageKeys.map(key => bucket.delete(key)));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

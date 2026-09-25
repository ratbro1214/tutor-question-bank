import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { questions, students } from "@/db/schema";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select({
      id: students.id, name: students.name, grade: students.grade, notes: students.notes,
      createdAt: students.createdAt,
      questionCount: sql<number>`count(${questions.id})`,
      latestQuestionAt: sql<string | null>`max(${questions.createdAt})`,
    }).from(students).leftJoin(questions, eq(questions.studentId, students.id))
      .groupBy(students.id).orderBy(desc(students.updatedAt), students.name);
    return Response.json({ students: rows });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { name?: string; grade?: string; notes?: string };
    const name = payload.name?.trim();
    if (!name) return Response.json({ error: "请填写学生姓名。" }, { status: 400 });
    const db = getDb();
    const [student] = await db.insert(students).values({
      name, grade: payload.grade?.trim() || "初中", notes: payload.notes?.trim() || "",
    }).returning();
    return Response.json({ student }, { status: 201 });
  } catch (error) {
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

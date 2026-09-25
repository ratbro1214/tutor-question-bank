import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { knowledgePoints, questionKnowledgePoints, questions, students } from "@/db/schema";
import { apiError } from "@/lib/api-error";
import { isClassification, type Classification } from "@/lib/classification";
import { getBucket } from "@/lib/storage";

export async function POST(request: Request) {
  let imageKey = "";
  try {
    const form = await request.formData();
    const image = form.get("image");
    const studentId = Number(form.get("studentId"));
    const ai = JSON.parse(String(form.get("aiClassification") || "null")) as Classification;
    const confirmed = JSON.parse(String(form.get("teacherConfirmedClassification") || "null")) as Classification;
    if (!(image instanceof File) || !image.type.startsWith("image/")) return Response.json({ error: "请选择有效的题目图片。" }, { status: 400 });
    if (!Number.isInteger(studentId) || !isClassification(ai) || !isClassification(confirmed)) return Response.json({ error: "提交的数据不完整。" }, { status: 400 });

    const db = getDb();
    const [student] = await db.select({ id: students.id }).from(students).where(eq(students.id, studentId)).limit(1);
    if (!student) return Response.json({ error: "学生不存在。" }, { status: 404 });

    imageKey = `questions/${studentId}/${crypto.randomUUID()}-${image.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await getBucket().put(imageKey, await image.arrayBuffer(), { httpMetadata: { contentType: image.type } });
    const [question] = await db.insert(questions).values({
      studentId, imageKey, originalFilename: image.name, imageMimeType: image.type,
      extractedQuestion: confirmed.extracted_question, chapterCode: confirmed.chapter.code,
      chapterName: confirmed.chapter.name, questionType: confirmed.question_type, difficulty: confirmed.difficulty,
      aiClassification: JSON.stringify(ai), teacherConfirmedClassification: JSON.stringify(confirmed),
    }).returning();

    for (const point of confirmed.knowledge_points) {
      await db.insert(knowledgePoints).values({ code: point.code, name: point.name, chapterCode: confirmed.chapter.code })
        .onConflictDoUpdate({ target: knowledgePoints.code, set: { name: point.name, chapterCode: confirmed.chapter.code } });
      const [stored] = await db.select({ id: knowledgePoints.id }).from(knowledgePoints).where(eq(knowledgePoints.code, point.code)).limit(1);
      if (stored) await db.insert(questionKnowledgePoints).values({ questionId: question.id, knowledgePointId: stored.id })
        .onConflictDoNothing({ target: [questionKnowledgePoints.questionId, questionKnowledgePoints.knowledgePointId] });
    }
    return Response.json({ question: { id: question.id } }, { status: 201 });
  } catch (error) {
    if (imageKey) await getBucket().delete(imageKey).catch(() => undefined);
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

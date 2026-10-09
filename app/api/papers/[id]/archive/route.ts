import { z } from "zod";
import { getD1Binding } from "@/db";
import { findPaper, paperFailure, type PaperQuestionRow } from "@/lib/paper-server";
import { normalizeClassificationTags, validateClassification, type Classification } from "@/lib/classification";
import { explanationContentSchema } from "@/lib/question-explanation";
import { taxonomyForStage } from "@/lib/taxonomy";
import { getBucket } from "@/lib/storage";

const payloadSchema = z.object({ studentId: z.number().int().positive(), confirmed: z.literal(true), questions: z.array(z.object({ id: z.string().uuid(), revision: z.number().int().nonnegative() })).min(1).max(80) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const payload = payloadSchema.safeParse(await request.json());
    if (!payload.success) return Response.json({ error: "请选择题目、目标题库，并核对分类。" }, { status: 400 });
    const { id } = await context.params, paper = await findPaper(id);
    if (!paper) return Response.json({ error: "套卷不存在。" }, { status: 404 });
    const db = getD1Binding(), { studentId } = payload.data;
    if (!await db.prepare("SELECT id FROM students WHERE id=? AND deleted_at IS NULL").bind(studentId).first()) return Response.json({ error: "目标题库不存在。" }, { status: 404 });
    const entries = [];
    for (const selected of [...new Map(payload.data.questions.map(q => [q.id, q])).values()]) {
      const row = await db.prepare("SELECT * FROM paper_questions WHERE id=? AND paper_id=?").bind(selected.id, id).first<PaperQuestionRow>();
      if (!row) return Response.json({ error: "所选题目不属于这份套卷。" }, { status: 404 });
      const submissionId = `paper:${row.id}:${studentId}`;
      const existing = await db.prepare("SELECT id,deleted_at FROM questions WHERE submission_id=?").bind(submissionId).first<{ id: number; deleted_at: string | null }>();
      if (existing?.deleted_at) return Response.json({ error: `第 ${row.question_number} 题已在回收站，请先恢复。` }, { status: 409 });
      if (existing) { entries.push({ row, submissionId, existing, classification: null }); continue; }
      if (row.revision !== selected.revision || row.status === "processing" || row.status === "pending" || row.error) return Response.json({ error: `第 ${row.question_number} 题已变化或尚未完成分类，请刷新并完成分类后添加。` }, { status: 409 });
      const classification = row.classification ? normalizeClassificationTags(JSON.parse(row.classification) as Classification) : null;
      if (!classification || validateClassification(classification).length || !classification.knowledge_points.length) return Response.json({ error: `第 ${row.question_number} 题缺少可靠分类，请先快速分类并核对。` }, { status: 400 });
      if (row.explanation && !explanationContentSchema.safeParse(JSON.parse(row.explanation)).success) return Response.json({ error: "解析格式无效，请重新生成。" }, { status: 400 });
      entries.push({ row, submissionId, existing, classification });
    }
    const now = new Date().toISOString();
    const results = [];
    for (const entry of entries) {
      const { row, submissionId, existing, classification } = entry;
      if (!existing && classification) {
        const object = await getBucket().get(row.image_key);
        if (!object) throw Error("Missing question image");
        const bytes = await object.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
        // A private image copy keeps the two archives independent.
        const imageKey = `questions/${studentId}/paper-${row.id}-${crypto.randomUUID()}`;
        await getBucket().put(imageKey, bytes, { httpMetadata: { contentType: object.httpMetadata?.contentType || "image/jpeg" } });
        const confirmed = { ...classification, needs_review: false, review_reasons: [] };
        const statements = [db.prepare(`INSERT INTO questions (student_id,image_key,image_hash,submission_id,original_filename,image_mime_type,extracted_question,chapter_code,chapter_name,question_type,difficulty,ai_classification,classification_source,teacher_confirmed_classification)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(submission_id) DO NOTHING`).bind(studentId, imageKey, hash, submissionId, `${paper.title}-第${row.question_number}题.jpg`, object.httpMetadata?.contentType || "image/jpeg", row.question_text, classification.chapter.code, classification.chapter.name, classification.question_type, classification.difficulty, JSON.stringify(classification), "live_ai", JSON.stringify(confirmed))];
        for (const point of classification.knowledge_points) {
          const owner = taxonomyForStage(classification.education_stage).find(([code]) => code === point.code)?.[2] || classification.chapter.code;
          statements.push(db.prepare("INSERT INTO knowledge_points(code,name,chapter_code) VALUES (?,?,?) ON CONFLICT(code) DO NOTHING").bind(point.code, point.name, owner));
          statements.push(db.prepare("INSERT INTO question_knowledge_points(question_id,knowledge_point_id) SELECT q.id,k.id FROM questions q,knowledge_points k WHERE q.submission_id=? AND k.code=? ON CONFLICT DO NOTHING").bind(submissionId, point.code));
        }
        if (row.explanation) statements.push(db.prepare("INSERT INTO question_explanations(question_id,content,source_text,revision,origin,model,reviewed,updated_at) SELECT id,?,?,1,'ai',?,0,? FROM questions WHERE submission_id=? ON CONFLICT(question_id) DO NOTHING").bind(row.explanation, row.question_text, row.model, now, submissionId));
        // Archiving a revision exercise does not invent a student inquiry or attempt.
        await db.batch(statements);
        const committed = await db.prepare("SELECT image_key FROM questions WHERE submission_id=?").bind(submissionId).first<{ image_key: string }>();
        if (committed?.image_key !== imageKey) await getBucket().delete(imageKey);
      }
      const question = existing || await db.prepare("SELECT id FROM questions WHERE submission_id=?").bind(submissionId).first<{ id: number }>();
      results.push({ number: row.question_number, questionId: question!.id, existing: !!existing, url: `/students/${studentId}/questions/${question!.id}` });
    }
    return Response.json({ questions: results, studentUrl: `/students/${studentId}` });
  } catch (error) { return paperFailure(error); }
}

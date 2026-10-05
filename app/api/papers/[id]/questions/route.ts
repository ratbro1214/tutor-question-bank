import { z } from "zod";
import { getD1Binding } from "@/db";
import { getBucket } from "@/lib/storage";
import { cropRegionSchema } from "@/lib/paper";
import { findPaper, paperFailure, publicPaperQuestion, type PaperQuestionRow } from "@/lib/paper-server";
const metadataSchema = z.object({ number: z.number().int().min(1).max(200), regions: z.array(cropRegionSchema).min(1).max(20), text: z.string().max(16000), replace: z.boolean().optional(), expectedRevision: z.number().int().nonnegative().optional() });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let key = "", committed = false;
  try {
    const { id: paperId } = await context.params;
    if (!await findPaper(paperId)) return Response.json({ error: "套卷不存在。" }, { status: 404 });
    const form = await request.formData(), image = form.get("image");
    const input = metadataSchema.parse(JSON.parse(String(form.get("metadata"))));
    if (!(image instanceof File) || !["image/jpeg", "image/png"].includes(image.type) || !image.size || image.size > 8 * 1024 * 1024) return Response.json({ error: "单题裁切图片无效，图片上限 8MB。" }, { status: 400 });
    const existing = await getD1Binding().prepare("SELECT * FROM paper_questions WHERE paper_id=? AND question_number=?").bind(paperId, input.number).first<PaperQuestionRow>();
    if (existing && !input.replace) return Response.json({ question: publicPaperQuestion(existing), reused: true });
    if (existing && (input.expectedRevision !== existing.revision || existing.status === "processing")) return Response.json({ error: "此题已更新或正在解析，请重新读取后再调整裁切。" }, { status: 409 });
    const id = crypto.randomUUID(); key = `papers/${paperId}/questions/${id}`;
    await getBucket().put(key, await image.arrayBuffer(), { httpMetadata: { contentType: image.type } });
    if (existing) {
      // Retain the previous explanation until the corrected image is successfully solved.
      const updated = await getD1Binding().prepare("UPDATE paper_questions SET regions=?,image_key=?,question_text=?,classification=NULL,status='pending',error='裁切已更新，旧解析保留供参考，请重新生成核对。',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status<>'processing' RETURNING *").bind(JSON.stringify(input.regions), key, input.text, new Date().toISOString(), existing.id, input.expectedRevision).first<PaperQuestionRow>();
      if (!updated) return Response.json({ error: "裁切已在其他页面更新，请重新读取。" }, { status: 409 });
      committed = true; return Response.json({ question: publicPaperQuestion(updated) });
    }
    await getD1Binding().prepare("INSERT INTO paper_questions(id,paper_id,question_number,regions,image_key,question_text,updated_at) VALUES(?,?,?,?,?,?,?)").bind(id, paperId, input.number, JSON.stringify(input.regions), key, input.text, new Date().toISOString()).run(); committed = true;
    const row = await getD1Binding().prepare("SELECT * FROM paper_questions WHERE id=?").bind(id).first<PaperQuestionRow>();
    return Response.json({ question: publicPaperQuestion(row!) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "题号或裁切范围无效，请检查后重试。" }, { status: 400 });
    return paperFailure(error);
  } finally { if (key && !committed) await getBucket().delete(key).catch(() => {}); }
}

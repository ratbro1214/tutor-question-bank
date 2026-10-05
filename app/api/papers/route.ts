import { getD1Binding } from "@/db";
import { getBucket } from "@/lib/storage";
import { paperFailure, publicPaper, type PaperRow } from "@/lib/paper-server";

export async function GET() {
  try {
    const rows = await getD1Binding().prepare("SELECT p.*, (SELECT count(*) FROM paper_questions WHERE paper_id=p.id) AS question_count, (SELECT count(*) FROM paper_questions WHERE paper_id=p.id AND explanation IS NOT NULL) AS completed_count FROM papers p ORDER BY created_at DESC").all<PaperRow>();
    return Response.json({ papers: rows.results.map(publicPaper) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return paperFailure(error); }
}
export async function POST(request: Request) {
  let key = "", saved = false;
  try {
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 40 * 1024 * 1024) return Response.json({ error: "请选择 PDF、JPG 或 PNG 文件，文件上限 40MB。" }, { status: 400 });
    const bytes = await file.arrayBuffer(), prefix = new Uint8Array(bytes).slice(0, 8);
    const sourceType = new TextDecoder().decode(prefix).startsWith("%PDF-") ? "application/pdf" : prefix[0] === 255 && prefix[1] === 216 ? "image/jpeg" : prefix[0] === 137 && prefix[1] === 80 && prefix[2] === 78 && prefix[3] === 71 ? "image/png" : "";
    if (!sourceType) return Response.json({ error: "文件内容不是支持的 PDF、JPG 或 PNG。" }, { status: 400 });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
    const existing = await getD1Binding().prepare("SELECT * FROM papers WHERE file_hash=?").bind(hash).first<PaperRow>();
    if (existing) return Response.json({ paper: publicPaper(existing), reused: true });
    const id = crypto.randomUUID(), title = String(form.get("title") || file.name.replace(/\.[^.]+$/, "")).trim().slice(0, 200);
    key = `papers/${id}/source`;
    await getBucket().put(key, bytes, { httpMetadata: { contentType: sourceType } });
    await getD1Binding().prepare("INSERT INTO papers(id,title,original_filename,source_key,source_type,file_hash,created_at) VALUES(?,?,?,?,?,?,?)").bind(id, title || "未命名套卷", file.name.slice(0, 240), key, sourceType, hash, new Date().toISOString()).run();
    saved = true;
    const row = await getD1Binding().prepare("SELECT * FROM papers WHERE id=?").bind(id).first<PaperRow>();
    return Response.json({ paper: publicPaper(row!) }, { status: 201 });
  } catch (error) { return paperFailure(error); }
  finally { if (key && !saved) await getBucket().delete(key).catch(() => {}); }
}

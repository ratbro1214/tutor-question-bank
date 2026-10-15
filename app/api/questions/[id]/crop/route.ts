import { getD1Binding } from '@/db';
import { getBucket } from '@/lib/storage';
import { findPaper, paperFailure } from '@/lib/paper-server';

type Row = { id: number; image_key: string; submission_id: string | null };
async function source(request: Request, id: string) {
  if (!/^[1-9]\d*$/.test(id)) return null;
  const row = await getD1Binding().prepare('SELECT id,image_key,submission_id FROM questions WHERE id=? AND deleted_at IS NULL').bind(Number(id)).first<Row>();
  if (!row) return null;
  const origin = await getD1Binding().prepare("SELECT p.id,p.source_key,pq.question_number,pq.regions FROM paper_questions pq JOIN papers p ON p.id=pq.paper_id JOIN questions q ON q.submission_id='paper:'||pq.id||':'||q.student_id WHERE q.id=?").bind(row.id).first<{ id: string; source_key: string; question_number: number; regions: string }>();
  if (origin) await findPaper(origin.id, request);
  return { row, origin };
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const item = await source(request, (await context.params).id);
    if (!item) return Response.json({ error: '题目不存在。' }, { status: 404 });
    const object = await getBucket().head(item.row.image_key);
    const key = item.origin?.source_key || object?.customMetadata?.originalImageKey || item.row.image_key;
    return Response.json({ sourceUrl: `/api/images/${encodeURIComponent(key)}`, expectedImageKey: item.row.image_key, number: item.origin?.question_number || 1, regions: item.origin ? JSON.parse(item.origin.regions) : [{ page: 1, x: 0, y: 0, width: 1, height: 1 }] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return paperFailure(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let key = '', committed = false;
  try {
    const item = await source(request, (await context.params).id);
    if (!item) return Response.json({ error: '题目不存在。' }, { status: 404 });
    const form = await request.formData(), image = form.get('image');
    if (form.get('expectedImageKey') !== item.row.image_key) return Response.json({ error: '图片已更新，请关闭后重新裁剪。' }, { status: 409 });
    if (!(image instanceof File) || !['image/jpeg', 'image/png'].includes(image.type) || !image.size || image.size > 8 * 1024 * 1024) return Response.json({ error: '请选择 8MB 以内的 JPG 或 PNG 图片。' }, { status: 400 });
    const bytes = await image.arrayBuffer(), signature = new Uint8Array(bytes);
    if (!(image.type === 'image/jpeg' ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255 : signature.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10')) return Response.json({ error: '图片格式无效。' }, { status: 400 });
    const original = await getBucket().head(item.row.image_key);
    key = `${item.origin ? `papers/${item.origin.id}/archive-crops` : 'question-crops'}/${item.row.id}/${crypto.randomUUID()}`;
    await getBucket().put(key, bytes, { httpMetadata: { contentType: image.type }, customMetadata: { originalImageKey: original?.customMetadata?.originalImageKey || item.row.image_key } });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const updated = await getD1Binding().prepare('UPDATE questions SET image_key=?,image_mime_type=?,image_hash=? WHERE id=? AND image_key=? AND deleted_at IS NULL').bind(key, image.type, hash, item.row.id, item.row.image_key).run();
    if (!updated.meta.changes) return Response.json({ error: '图片已更新，请重新打开后裁剪。' }, { status: 409 });
    committed = true;
    return Response.json({ imageUrl: `/api/images/${encodeURIComponent(key)}` });
  } catch (error) { return paperFailure(error); }
  finally { if (key && !committed) await getBucket().delete(key).catch(() => {}); }
}

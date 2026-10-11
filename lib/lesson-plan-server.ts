import { z } from 'zod';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getD1Binding } from '@/db';
import { libraryScopes, LibraryError } from './math-library-server';
import { LessonError, LessonStore } from './lesson-plan-store';

export async function lessonStore(request: Request, mutation = false) {
  const user = await getChatGPTUser();
  if (!user) throw new LessonError('请先登录后访问私人教案。', 401);
  if (mutation) {
    const origin = request.headers.get('Origin');
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')
      throw new LessonError('不允许跨站修改教案。', 403);
  }
  let scopes: string[] = [];
  try { scopes = await libraryScopes(request); } catch (error) { if (!(error instanceof LibraryError && error.status === 403)) throw error; }
  return new LessonStore(getD1Binding(), user.userId, scopes);
}
export async function lessonBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 512000) throw new LessonError('教案内容过大。', 413);
  try { return JSON.parse(raw); } catch { throw new LessonError('请求 JSON 无效。', 400); }
}
export function lessonResponse(data: unknown) { return Response.json(data, { headers: { 'Cache-Control': 'no-store' } }); }
export function lessonFailure(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message || '教案数据无效。' }, { status: 400 });
  if (error instanceof LessonError || error instanceof LibraryError) return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  // Do not log private draft text or database bindings.
  console.error('[lesson-plans] database operation failed');
  return Response.json({ error: '教案读写失败，请重试；页面中的草稿仍保留。' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}

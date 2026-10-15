import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getD1Binding } from '@/db';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { libraryScopes, LibraryError } from '../math-library-server';
import { CatalogError, KnowledgeAttachmentStore } from './attachment-store';

export function assertCatalogOrigin(request: Request) {
  if ((request.headers.get('Origin') && request.headers.get('Origin') !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new CatalogError('不允许跨站修改。', 403);
}
export async function catalogStore(request: Request, mutation = false) {
  const user = await getChatGPTUser();
  if (!user) throw new CatalogError('请先登录。', 401);
  if (mutation) assertCatalogOrigin(request);
  const scopes = await libraryScopes(request);
  const owner = (env as unknown as Record<string, string | undefined>).PROJECT_OWNER_USER_ID;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname) && user.userId === 'local_seedy';
  return new KnowledgeAttachmentStore(getD1Binding(), user.userId, scopes, local || Boolean(owner && owner === user.userId));
}
export const catalogResponse = (data: unknown) => Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
export async function catalogBody(request: Request) {
  const text = await request.text();
  if (text.length > 12000) throw new CatalogError('请求内容过大。', 413);
  try { return JSON.parse(text); } catch { throw new CatalogError('JSON 格式无效。'); }
}
export function catalogFailure(error: unknown) {
  const status = error instanceof CatalogError || error instanceof LibraryError ? error.status : error instanceof z.ZodError ? 400 : 503;
  return Response.json({ error: status === 503 ? '知识库暂不可用，请确认已执行 0023、0024 迁移并导入种子数据。' : error instanceof z.ZodError ? '请求参数无效。' : (error as Error).message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function syncPaperKnowledge(request: Request, paperQuestionId: string) {
  try {
    const store = await catalogStore(request, true);
    const link = await store.db.prepare("SELECT canonical_question_id FROM question_module_links WHERE module_type='paper_question' AND module_record_id=?").bind(paperQuestionId).first<{ canonical_question_id: string }>();
    if (!link) return { status: 'awaiting_identity', message: '知识分析已保存，确认加入统一题库后自动挂载。' };
    return await store.attach(link.canonical_question_id);
  } catch {
    return { status: 'deferred', message: '识别结果已保存；知识挂载待重试，请检查知识库初始化状态。' };
  }
}

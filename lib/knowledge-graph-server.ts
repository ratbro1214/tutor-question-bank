import { z } from 'zod';
import { getD1Binding } from '@/db';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { libraryScopes, LibraryError } from './math-library-server';
import { KnowledgeGraphStore, GraphError } from './knowledge-graph-store';
export async function graphStore(request: Request, mutation = false) {
  const user = await getChatGPTUser(); if (!user) throw new GraphError('请先登录。', 401);
  if (mutation && ((request.headers.get('Origin') && request.headers.get('Origin') !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')) throw new GraphError('不允许跨站修改。', 403);
  const url = new URL(request.url); url.searchParams.delete('scope');
  return new KnowledgeGraphStore(getD1Binding(), user.userId, await libraryScopes(new Request(url, { headers: request.headers })));
}
export const graphResponse = (data: unknown) => Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
export async function graphBody(request: Request) { const text = await request.text(); if (text.length > 120000) throw new GraphError('请求过大。', 413); try { return JSON.parse(text); } catch { throw new GraphError('请求格式无效。'); } }
export function graphFailure(error: unknown) {
  const status = error instanceof GraphError || error instanceof LibraryError ? error.status : error instanceof z.ZodError ? 400 : 500;
  if (status === 500) console.warn('[knowledge-graph] operation failed');
  return Response.json({ error: status === 500 ? '知识网络操作失败，已保存数据仍保留。请检查迁移是否已应用。' : error instanceof z.ZodError ? error.issues[0]?.message : (error as Error).message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

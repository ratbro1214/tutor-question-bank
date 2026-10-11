import { z } from 'zod';
import { methodContentSchema, similarMethods, methodWriteSchema } from '@/lib/knowledge-graph';
import { graphStore, graphBody, graphResponse, graphFailure } from '@/lib/knowledge-graph-server';
export async function GET(request: Request) { try { const store = await graphStore(request), p = new URL(request.url).searchParams; const items = await store.methods(p.get('approved') !== 'false', p.get('scope') || undefined); return graphResponse({ items }); } catch (e) { return graphFailure(e); } }
export async function POST(request: Request) { try { const store = await graphStore(request, true), body = await graphBody(request);
  if (body.action === 'similar') return graphResponse({ items: similarMethods(methodContentSchema.parse(body.content), await store.methods(false)) });
  const { id, ...input } = methodWriteSchema.extend({ id: z.string().uuid() }).parse(body); return graphResponse(await store.writeMethod(id, input));
} catch (e) { return graphFailure(e); } }

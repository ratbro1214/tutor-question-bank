import { z } from 'zod';
import { relationWriteSchema } from '@/lib/knowledge-graph';
import { graphStore, graphBody, graphResponse, graphFailure } from '@/lib/knowledge-graph-server';
export async function GET(request: Request) { try { const store = await graphStore(request), p = new URL(request.url).searchParams;
  const knowledgeId = p.get('knowledgeId') ? z.coerce.number().int().positive().parse(p.get('knowledgeId')) : undefined;
  return graphResponse({ items: await store.relations(p.get('approved') !== 'false', p.get('scope') || undefined, { knowledgeId, methodId: p.get('methodId') || undefined, canonicalId: p.get('canonicalId') || undefined }) });
} catch (e) { return graphFailure(e); } }
export async function POST(request: Request) { try { const store = await graphStore(request, true), body = await graphBody(request); const id = z.string().uuid().parse(body.id); delete body.id; return graphResponse(await store.writeRelation(id, relationWriteSchema.parse(body))); } catch (e) { return graphFailure(e); } }

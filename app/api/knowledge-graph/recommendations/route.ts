import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { graphStore, graphBody, graphResponse, graphFailure } from '@/lib/knowledge-graph-server';
import { GraphError } from '@/lib/knowledge-graph-store';
import { configuredExplanationProvider } from '@/lib/ai-provider';
import { recommendWithFallback, retrieveMethods } from '@/lib/method-recommendation';

const base = z.object({ canonicalId: z.string().min(1).max(160), revisionId: z.string().min(1).max(160), reviewId: z.string().min(1).max(160) });
const inputSchema = z.discriminatedUnion('action', [base.extend({ action: z.literal('analyze') }).strict(), base.extend({ action: z.literal('confirm'), methodId: z.string().min(1).max(160), methodRevision: z.number().int().positive(), operationId: z.string().uuid(), relationId: z.string().uuid() }).strict()]);
export async function POST(request: Request) { try {
  const store = await graphStore(request, true), input = inputSchema.parse(await graphBody(request));
  const q = await store.question(input.canonicalId, input.revisionId);
  const { evidence } = await store.evidence(input.canonicalId, input.revisionId, input.reviewId);
  if (input.action === 'confirm') {
    const method = await store.getMethod(input.methodId);
    if (method.scope_id !== q.scope_id || method.status !== 'approved' || !method.evidenceValid || method.merged_into || method.revision !== input.methodRevision) throw new GraphError('方法已变更或未审核，请重新分析。', 409);
    return graphResponse(await store.writeRelation(input.relationId, { operationId: input.operationId, expectedRevision: 0, scopeId: method.scope_id, status: 'approved', type: 'uses', fromKnowledge: null, toKnowledge: null, methodId: method.id, canonicalId: input.canonicalId, revisionId: input.revisionId, source: { origin: 'manual', note: '教师核对智能推荐与具体已审核解法后确认关联', evidence } }));
  }
  const methods = retrieveMethods(String(q.original_text), await store.methods(true, String(q.scope_id)));
  if (!methods.length) return graphResponse({ result: null, methods: [], message: '当前题库暂无已审核且有效的方法。请先加入并审核方法卡。' });
  let response;
  try { response = await recommendWithFallback(String(q.original_text), methods, configuredExplanationProvider(env as unknown as Record<string, unknown>), request.signal); }
  catch (error) { throw new GraphError(error instanceof Error ? error.message : '方法分析失败，请重试。', 502); }
  await store.question(input.canonicalId, input.revisionId);
  await store.evidence(input.canonicalId, input.revisionId, input.reviewId);
  return graphResponse({ ...response, methods: methods.map(m => ({ id: m.id, name: m.content.name })) });
} catch (error) { return graphFailure(error); } }

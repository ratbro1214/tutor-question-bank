import { z } from 'zod';
import { graphStore, graphBody, graphResponse, graphFailure } from '@/lib/knowledge-graph-server';
import { importCoreStrategies } from '@/lib/method-strategies';
import { decideStrategies, decisionFactsSchema } from '@/lib/strategy-decision';
import { GraphError } from '@/lib/knowledge-graph-store';
import { conditionInputSchema } from '@/lib/method-condition-verification';

const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), scopeId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('import'), scopeId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('decide'), canonicalId: z.string().min(1).max(160).optional(), revisionId: z.string().min(1).max(160).optional(), scopeId: z.string().min(1).optional(), text: z.string().trim().min(1).max(16000).optional(), facts: decisionFactsSchema.default({}), verification: conditionInputSchema.optional() }).strict(),
]);
export async function POST(request: Request) { try {
  const store = await graphStore(request, true), input = inputSchema.parse(await graphBody(request));
  if (input.action !== 'decide') return graphResponse(await importCoreStrategies(store, input.scopeId, input.action === 'preview'));
  if (input.canonicalId) {
    const q = await store.question(input.canonicalId, input.revisionId);
    const result = decideStrategies(String(q.original_text), await store.methods(false, String(q.scope_id)), input.facts, input.verification);
    return graphResponse({ ...result, canonicalId: input.canonicalId, revisionId: q.current_revision_id });
  }
  if (!input.text || !input.scopeId) throw new GraphError('请选择题库范围并填写题干。');
  return graphResponse(decideStrategies(input.text, await store.methods(false, input.scopeId), input.facts, input.verification));
} catch (e) { return graphFailure(e); } }

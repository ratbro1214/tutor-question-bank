import { z } from 'zod';
import { catalogStore, catalogResponse, catalogBody, catalogFailure } from '@/lib/knowledge_graph/server';

const text = z.string().trim().min(1).max(250);
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('attach'), questionId: text, revisionId: text }).strict(),
  z.object({ action: z.literal('approve_node'), nodeId: text, expectedUpdatedAt: text, parentId: text.optional() }).strict(),
  z.object({ action: z.literal('approve_edge'), edgeId: text, expectedUpdatedAt: text }).strict(),
  z.object({ action: z.literal('approve_link'), questionId: text, knowledgeId: text, revisionId: text, expectedUpdatedAt: text }).strict(),
]);
export async function GET(request: Request) {
  try {
    const store = await catalogStore(request), params = new URL(request.url).searchParams;
    const questionId = params.get('questionId');
    if (questionId) return catalogResponse({ items: await store.questionLinks(text.parse(questionId)) });
    const mode = z.enum(['approved', 'review']).parse(params.get('view') ?? 'approved');
    return catalogResponse({ ...await store.list(mode === 'review'), capabilities: { canReviewSeed: store.curator } });
  } catch (error) { return catalogFailure(error); }
}
export async function POST(request: Request) {
  try {
    const store = await catalogStore(request, true), input = action.parse(await catalogBody(request));
    if (input.action === 'attach') return catalogResponse(await store.attach(input.questionId, input.revisionId));
    if (input.action === 'approve_node') return catalogResponse(await store.reviewNode(input.nodeId, input.expectedUpdatedAt, input.parentId));
    if (input.action === 'approve_edge') return catalogResponse(await store.reviewEdge(input.edgeId, input.expectedUpdatedAt));
    return catalogResponse(await store.reviewLink(input.questionId, input.knowledgeId, input.revisionId, input.expectedUpdatedAt));
  } catch (error) { return catalogFailure(error); }
}

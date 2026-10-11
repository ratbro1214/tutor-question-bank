import { z } from 'zod';
import { graphStore, graphBody, graphResponse, graphFailure } from '@/lib/knowledge-graph-server';
export async function POST(request: Request) { try { const store = await graphStore(request, true), input = z.object({ canonicalId: z.string().min(1), revisionId: z.string().min(1), reviewId: z.string().min(1) }).strict().parse(await graphBody(request)); const { evidence } = await store.evidence(input.canonicalId, input.revisionId, input.reviewId); return graphResponse({ evidence }); } catch (e) { return graphFailure(e); } }

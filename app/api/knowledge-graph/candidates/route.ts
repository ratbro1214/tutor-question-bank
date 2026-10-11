import { z } from 'zod';
import { graphStore, graphBody, graphResponse, graphFailure } from '@/lib/knowledge-graph-server';
export async function POST(request: Request) { try { const store = await graphStore(request, true), input = z.object({ canonicalId: z.string().min(1), revisionId: z.string().min(1), reviewId: z.string().min(1) }).strict().parse(await graphBody(request)); return graphResponse(await store.candidates(input.canonicalId, input.revisionId, input.reviewId)); } catch (e) { return graphFailure(e); } }

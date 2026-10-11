import { z } from 'zod';
import { initializePilot } from '@/lib/knowledge-graph-pilot';
import { graphStore, graphBody, graphResponse, graphFailure } from '@/lib/knowledge-graph-server';
export async function POST(request: Request) { try { const store = await graphStore(request, true), input = z.object({ scopeId: z.string().min(1) }).strict().parse(await graphBody(request)); return graphResponse(await initializePilot(store, input.scopeId)); } catch (e) { return graphFailure(e); } }

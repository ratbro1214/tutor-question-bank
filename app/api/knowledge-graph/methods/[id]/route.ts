import { graphStore, graphBody, graphResponse, graphFailure } from '@/lib/knowledge-graph-server';
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) { try { return graphResponse(await (await graphStore(request)).getMethod((await ctx.params).id)); } catch (e) { return graphFailure(e); } }
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) { try { return graphResponse(await (await graphStore(request, true)).writeMethod((await ctx.params).id, await graphBody(request))); } catch (e) { return graphFailure(e); } }

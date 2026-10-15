import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { methodContentSchema } from '@/lib/knowledge-graph';
import { graphStore, graphBody, graphResponse, graphFailure } from '@/lib/knowledge-graph-server';
import { configuredExplanationProvider } from '@/lib/ai-provider';
import { completeMethodThinking, MethodCompletionError } from '@/lib/method-completion-ai';

export async function POST(request: Request) { try {
  await graphStore(request, true);
  const input = z.object({ content: methodContentSchema }).strict().parse(await graphBody(request));
  const settings = env as unknown as Record<string, unknown>, config = configuredExplanationProvider(settings);
  // This task is text-only; use the existing text/classification model when configured.
  const textModel = settings.AI_PROVIDER === 'deepseek' ? settings.DEEPSEEK_CLASSIFICATION_MODEL : settings.OPENAI_CLASSIFICATION_MODEL;
  if (typeof textModel === 'string' && textModel.trim()) config.model = textModel.trim();
  return graphResponse(await completeMethodThinking(input.content, config, request.signal));
} catch (error) {
  if (error instanceof MethodCompletionError) return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  return graphFailure(error);
} }

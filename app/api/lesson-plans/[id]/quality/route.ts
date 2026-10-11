import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { configuredExplanationProvider } from '@/lib/ai-provider';
import { LessonGenerationError } from '@/lib/lesson-generation';
import { inspectLessonQuality } from '@/lib/lesson-quality-workflow';
import { lessonBody, lessonFailure, lessonResponse, lessonStore } from '@/lib/lesson-plan-server';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const store = await lessonStore(request, true), id = z.string().uuid().parse((await context.params).id);
    return lessonResponse(await inspectLessonQuality(store, id, await lessonBody(request), configuredExplanationProvider(env as unknown as Record<string, unknown>), request.signal));
  } catch (e) {
    if (e instanceof LessonGenerationError) return Response.json({ error: e.message, aiRequests: (e as LessonGenerationError & { aiRequests?: number }).aiRequests ?? 0,
      elapsedMs: (e as LessonGenerationError & { elapsedMs?: number }).elapsedMs ?? 0 }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
    const failure = lessonFailure(e);
    const metrics = e as { aiRequests?: number; elapsedMs?: number };
    return Response.json({ ...(await failure.json() as { error: string }), aiRequests: metrics?.aiRequests ?? 0, elapsedMs: metrics?.elapsedMs ?? 0 }, { status: failure.status, headers: { 'Cache-Control': 'no-store' } });
  }
}

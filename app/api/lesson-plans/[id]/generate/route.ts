import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { configuredExplanationProvider } from '@/lib/ai-provider';
import { LessonGenerationError } from '@/lib/lesson-generation';
import { createLessonDraft } from '@/lib/lesson-generation-workflow';
import { lessonBody, lessonFailure, lessonResponse, lessonStore } from '@/lib/lesson-plan-server';

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const store = await lessonStore(request), id = z.string().uuid().parse((await context.params).id);
    await store.get(id);
    const config = configuredExplanationProvider(env as unknown as Record<string, unknown>);
    return lessonResponse({ available: Boolean(config.apiKey?.trim()), model: config.model, message: config.apiKey?.trim() ? '已配置模型，生成结果须由教师接受。' : 'AI 不可用：尚未配置模型密钥；手动编辑和保存仍可使用。' });
  } catch (e) { return lessonFailure(e); }
}
export async function POST(request: Request, context: Context) {
  try {
    const store = await lessonStore(request, true), id = z.string().uuid().parse((await context.params).id);
    return lessonResponse(await createLessonDraft(store, id, await lessonBody(request), configuredExplanationProvider(env as unknown as Record<string, unknown>), request.signal));
  } catch (e) {
    if (e instanceof LessonGenerationError) return Response.json({ error: e.message }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
    return lessonFailure(e);
  }
}

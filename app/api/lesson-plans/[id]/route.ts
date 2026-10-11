import { z } from 'zod';
import { lessonWriteSchema } from '@/lib/lesson-plan';
import { lessonStore, lessonBody, lessonResponse, lessonFailure } from '@/lib/lesson-plan-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { const store = await lessonStore(request), id = z.string().uuid().parse((await context.params).id);
    const version = new URL(request.url).searchParams.get('version');
    return lessonResponse(await store.get(id, version ? z.string().uuid().parse(version) : undefined));
  } catch (error) { return lessonFailure(error); }
}
export async function PUT(request: Request, context: Context) {
  try { const store = await lessonStore(request, true), id = z.string().uuid().parse((await context.params).id);
    return lessonResponse(await store.write(id, lessonWriteSchema.parse(await lessonBody(request))));
  } catch (error) { return lessonFailure(error); }
}

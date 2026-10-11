import { z } from 'zod';
import { lessonWriteObject } from '@/lib/lesson-plan';
import { lessonStore, lessonBody, lessonResponse, lessonFailure } from '@/lib/lesson-plan-server';
export async function GET(request: Request) {
  try { const store = await lessonStore(request), p = new URL(request.url).searchParams;
    return lessonResponse({ items: await store.list(p.get('stage') || '', p.get('topic') || '', p.get('status') || 'active') });
  } catch (error) { return lessonFailure(error); }
}
export async function POST(request: Request) {
  try { const store = await lessonStore(request, true);
    const { id, ...input } = lessonWriteObject.extend({ id: z.string().uuid() }).parse(await lessonBody(request));
    return lessonResponse(await store.write(id, input, true));
  } catch (error) { return lessonFailure(error); }
}

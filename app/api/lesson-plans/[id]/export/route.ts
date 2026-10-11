import { z } from 'zod';
import { lessonFailure, lessonResponse, lessonStore } from '@/lib/lesson-plan-server';

// Returns one immutable saved-content snapshot for both Word versions. No AI call.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const store = await lessonStore(request), id = z.string().uuid().parse((await context.params).id);
    const version = z.string().uuid().parse(new URL(request.url).searchParams.get('version'));
    return lessonResponse(await store.exportSnapshot(id, version));
  } catch (e) { return lessonFailure(e); }
}

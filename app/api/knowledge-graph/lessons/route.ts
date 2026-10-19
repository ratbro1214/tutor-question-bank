import { z } from 'zod';
import { catalogStore, catalogResponse, catalogFailure } from '@/lib/knowledge_graph/server';
import { knowledgeLesson } from '@/lib/knowledge_graph/learning-content';

export async function GET(request: Request) {
  try {
    await catalogStore(request);
    const code = z.string().trim().min(1).max(160).parse(new URL(request.url).searchParams.get('code'));
    // This endpoint serves bundled teaching drafts, not private questions or audit decisions.
    return catalogResponse({ lesson: knowledgeLesson(code) });
  } catch (error) { return catalogFailure(error); }
}

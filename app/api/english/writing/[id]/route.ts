import corpus from '@/data/english/writing-practice.json';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = corpus.find(p => p.paperId === id);
  if (!paper) return Response.json({ error: '未找到作文真题' }, { status: 404 });
  return Response.json(paper);
}

import { getD1Binding } from '@/db';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const db = getD1Binding();
  const paper = await db.prepare(`SELECT p.* FROM english_papers p WHERE p.id=? AND EXISTS (SELECT 1 FROM english_sections s WHERE s.paper_id=p.id AND s.type='language')`).bind(id).first();
  if (!paper) return Response.json({ error: '未找到语言运用试题' }, { status: 404 });
  const [passages, questions, options, evidence] = await Promise.all([
    db.prepare(`SELECT t.*,(SELECT payload FROM english_annotations WHERE passage_id=t.id AND pipeline='source-crops' LIMIT 1) original_crops,n.payload metadata FROM english_passages t JOIN english_sections s ON t.section_id=s.id JOIN english_annotations n ON n.passage_id=t.id AND n.pipeline='language-practice' WHERE s.paper_id=? AND s.type='language' ORDER BY t.id`).bind(id).all(),
    db.prepare(`SELECT q.*,a.answer,a.status answer_status FROM english_questions q JOIN english_sections s ON q.section_id=s.id JOIN english_answers a ON a.question_id=q.id WHERE s.paper_id=? AND s.type='language' ORDER BY q.number`).bind(id).all(),
    db.prepare(`SELECT o.* FROM english_options o JOIN english_questions q ON o.question_id=q.id JOIN english_sections s ON q.section_id=s.id WHERE s.paper_id=? AND s.type='language' ORDER BY q.number,o.label`).bind(id).all(),
    db.prepare(`SELECT e.question_id,e.raw_answer,e.method,f.source_url,f.source_name,f.public_path FROM english_answer_evidence e JOIN english_artifacts f ON e.artifact_id=f.id JOIN english_questions q ON e.question_id=q.id JOIN english_sections s ON q.section_id=s.id WHERE s.paper_id=? AND s.type='language'`).bind(id).all(),
  ]);
  return Response.json({ paper, passages: passages.results, questions: questions.results, options: options.results, evidence: evidence.results });
}

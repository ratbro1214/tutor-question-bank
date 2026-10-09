import { getD1Binding } from '@/db';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const db = getD1Binding();
  const paper = await db.prepare('SELECT * FROM english_papers WHERE id=?').bind(id).first();
  if (!paper) return Response.json({ error: '未找到试卷' }, { status: 404 });
  const [artifacts, sections, passages, questions, options] = await Promise.all([
    db.prepare('SELECT * FROM english_artifacts WHERE paper_id=? ORDER BY rowid').bind(id).all(),
    db.prepare('SELECT * FROM english_sections WHERE paper_id=? ORDER BY position').bind(id).all(),
    db.prepare('SELECT p.* FROM english_passages p JOIN english_sections s ON p.section_id=s.id WHERE s.paper_id=? ORDER BY s.position, p.rowid').bind(id).all(),
    db.prepare('SELECT q.* FROM english_questions q JOIN english_sections s ON q.section_id=s.id WHERE s.paper_id=? ORDER BY q.number').bind(id).all(),
    db.prepare('SELECT o.* FROM english_options o JOIN english_questions q ON o.question_id=q.id JOIN english_sections s ON q.section_id=s.id WHERE s.paper_id=? ORDER BY q.number, o.label').bind(id).all(),
  ]);
  return Response.json({ paper, artifacts: artifacts.results, sections: sections.results, passages: passages.results, questions: questions.results, options: options.results });
}

import { getD1Binding } from '@/db';

export async function GET() {
 const db=getD1Binding();
 const rows=await db.prepare(`SELECT p.id,p.year,p.volume,p.title,COUNT(DISTINCT t.id) passage_count,COUNT(q.id) question_count
 FROM english_papers p JOIN english_sections s ON s.paper_id=p.id AND s.type='reading'
 JOIN english_passages t ON t.section_id=s.id JOIN english_questions q ON q.passage_id=t.id
 JOIN english_answers a ON a.question_id=q.id AND a.answer IS NOT NULL
 GROUP BY p.id ORDER BY p.year DESC,p.volume`).all();
 return Response.json({papers:rows.results});
}

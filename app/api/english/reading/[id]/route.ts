import { getD1Binding } from '@/db';

export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
 const {id}=await context.params;
 const db=getD1Binding();
 const paper=await db.prepare('SELECT * FROM english_papers WHERE id=?').bind(id).first();
 if(!paper)return Response.json({error:'未找到试卷'},{status:404});
 const [passages,questions,options,evidence]=await Promise.all([
  db.prepare(`SELECT t.*,(SELECT payload FROM english_annotations WHERE passage_id=t.id AND pipeline='source-crops' LIMIT 1) original_crops,n.payload figures FROM english_passages t JOIN english_sections s ON t.section_id=s.id LEFT JOIN english_annotations n ON n.passage_id=t.id AND n.pipeline='reading-figures' WHERE s.paper_id=? AND s.type='reading' ORDER BY CASE t.label WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END`).bind(id).all(),
  db.prepare(`SELECT q.*,a.answer,a.status answer_status FROM english_questions q JOIN english_sections s ON q.section_id=s.id JOIN english_answers a ON a.question_id=q.id WHERE s.paper_id=? AND s.type='reading' ORDER BY q.number`).bind(id).all(),
  db.prepare(`SELECT o.* FROM english_options o JOIN english_questions q ON o.question_id=q.id JOIN english_sections s ON q.section_id=s.id WHERE s.paper_id=? AND s.type='reading' ORDER BY q.number,o.label`).bind(id).all(),
  db.prepare(`SELECT e.question_id,e.raw_answer,e.method,f.source_url,f.source_name,f.public_path FROM english_answer_evidence e JOIN english_artifacts f ON e.artifact_id=f.id JOIN english_questions q ON e.question_id=q.id JOIN english_sections s ON q.section_id=s.id WHERE s.paper_id=? AND s.type='reading'`).bind(id).all(),
 ]);
 return Response.json({paper,passages:passages.results,questions:questions.results,options:options.results,evidence:evidence.results});
}

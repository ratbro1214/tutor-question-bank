import { matchQuestionRow, type MatchQuestionRow } from './paper-solution-store';
import { solutionReviewSchema } from './paper-solutions';
// Resolve through the existing occurrence/module relationship. Do not merge different papers' sources.
export async function canonicalSolutions(db:D1Database,owner:string,scopes:string[],canonicalId:string,revisionId:string){
 if(!scopes.length)return [];
 const rows=(await db.prepare(`SELECT q.*,e.id AS entry_id,e.data,m.teacher_text,m.question_snapshot,m.revision AS match_revision,m.status AS match_status,s.id AS source_id,s.filename,s.paper_id,s.scope_id,
 r.id AS review_id,r.result,r.teacher_result,r.teacher_status,r.match_revision AS review_match_revision,r.status AS review_status
 FROM question_module_links l JOIN canonical_questions c ON c.id=l.canonical_question_id
 JOIN question_occurrences o ON o.id=l.occurrence_id AND o.canonical_question_id=c.id
 JOIN source_documents d ON d.id=o.source_document_id AND d.scope_id=c.scope_id
 JOIN paper_questions q ON q.id=l.legacy_paper_question_id AND q.paper_id=d.math_paper_id
 JOIN paper_solution_matches m ON m.question_id=q.id JOIN paper_solution_entries e ON e.id=m.entry_id
 JOIN paper_solution_sources s ON s.id=e.source_id AND s.paper_id=q.paper_id AND s.scope_id=c.scope_id
 LEFT JOIN paper_solution_reviews r ON r.entry_id=e.id AND r.teacher_status='accepted' AND r.status='completed' AND r.match_revision=m.revision
 WHERE c.id=? AND o.content_revision_id=? AND c.scope_id IN (${scopes.map(()=>'?').join(',')}) AND s.owner_id=? AND m.status='CONFIRMED'
 AND o.mapping_status='confirmed' AND o.raw_text=q.question_text AND o.image_key=q.image_key
 ORDER BY s.created_at,e.id,r.created_at`).bind(canonicalId,revisionId,...scopes,owner).all<MatchQuestionRow&{entry_id:string;data:string;teacher_text:string|null;question_snapshot:string;match_revision:number;source_id:string;filename:string;paper_id:string;scope_id:string;review_id:string|null;result:string|null;teacher_result:string|null}>()).results;
 return rows.filter(r=>JSON.stringify(matchQuestionRow(r))===r.question_snapshot).map(r=>{const entry=JSON.parse(r.data),review=solutionReviewSchema.safeParse(JSON.parse(r.teacher_result||r.result||'null'));
  return {entryId:r.entry_id,sourceId:r.source_id,paperId:r.paper_id,filename:r.filename,original:entry.text,teacherText:r.teacher_text,answerOnly:entry.answerOnly,regions:entry.regions,
   sourceUrl:`/api/papers/${r.paper_id}/solutions/${r.source_id}/file`,matchRevision:r.match_revision,reviewId:r.review_id,review:review.success?review.data:null};
 });
}

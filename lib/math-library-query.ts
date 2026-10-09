// Read-only queries. One row per stable identity; source filters use EXISTS.
export type LibraryFilters = { query: string; stage: string; chapter: string; knowledge: string; type: string; difficulty: string; paper: string; classification: string; page: number; pageSize: number };
export function parseLibraryFilters(params: URLSearchParams): LibraryFilters {
 const take=(key:string,max=160)=>{const value=params.get(key)||'';if(value.length>max)throw Error('筛选条件过长。');return value.trim();};
 const integer=(key:string,fallback:number,max:number)=>{const v=params.get(key);if(v===null)return fallback;if(!/^\d+$/.test(v)||Number(v)<1||Number(v)>max)throw Error('分页参数无效。');return Number(v);};
 const classification=take('classification');if(classification&&!['classified','unclassified'].includes(classification))throw Error('分类筛选无效。');
 return {query:take('q',200),stage:take('stage'),chapter:take('chapter'),knowledge:take('knowledge'),type:take('type'),difficulty:take('difficulty'),paper:take('paper'),classification,page:integer('page',1,100000),pageSize:integer('pageSize',20,50)};
}
export function libraryBase(scopeIds: string[]) {
 if(!scopeIds.length)throw Error('没有可访问的题库范围。');
 return `WITH accessible AS (
 SELECT c.id,c.scope_id,c.status,c.current_revision_id,r.original_text,r.education_stage,r.identity_status,
 COALESCE(json_extract(r.payload,'$.classification'),
 (SELECT CASE WHEN l.module_type='paper_question' THEN pq.classification ELSE sq.teacher_confirmed_classification END
 FROM question_module_links l JOIN question_occurrences o ON o.id=l.occurrence_id AND o.canonical_question_id=c.id
 JOIN source_documents s ON s.id=o.source_document_id AND s.scope_id=c.scope_id
 LEFT JOIN paper_questions pq ON l.module_type='paper_question' AND pq.id=l.module_record_id AND pq.question_text=r.original_text
 LEFT JOIN questions sq ON l.module_type='student_question' AND CAST(sq.id AS TEXT)=l.module_record_id AND sq.deleted_at IS NULL AND sq.extracted_question=r.original_text
 WHERE l.canonical_question_id=c.id AND o.content_revision_id=r.id AND o.mapping_status!='detached'
 AND json_valid(CASE WHEN l.module_type='paper_question' THEN pq.classification ELSE sq.teacher_confirmed_classification END)
 ORDER BY l.created_at DESC,l.id LIMIT 1)) AS classification
 FROM canonical_questions c JOIN canonical_question_revisions r ON r.id=c.current_revision_id AND r.canonical_question_id=c.id
 WHERE c.scope_id IN (${scopeIds.map(()=>'?').join(',')}) AND c.subject='math' AND r.subject='math' AND c.status IN ('active','provisional')
 ), library AS (SELECT *,COALESCE(education_stage,json_extract(classification,'$.education_stage')) AS stage FROM accessible) `;
}
export const sourceExists = `SELECT 1 FROM question_occurrences o JOIN source_documents s ON s.id=o.source_document_id WHERE o.canonical_question_id=c.id AND s.scope_id=c.scope_id AND o.mapping_status!='detached'`;
export function libraryWhere(f: LibraryFilters) {
 const conditions:string[]=[],values:(string|number)[]=[];
 const add=(sql:string,value:string)=>{if(value){conditions.push(sql);values.push(value);}};
 // Escape LIKE wildcards: user keywords are literal text, all terms must match.
 for(const word of f.query.split(/\s+/).filter(Boolean)) {
  conditions.push(`(c.original_text LIKE ? ESCAPE '\\' OR c.classification LIKE ? ESCAPE '\\')`);
  const pattern='%'+word.replace(/[\\%_]/g,'\\$&')+'%';values.push(pattern,pattern);
 }
 add('c.stage=?',f.stage);add("json_extract(c.classification,'$.chapter.code')=?",f.chapter);
 add("EXISTS (SELECT 1 FROM json_each(c.classification,'$.knowledge_points') kp WHERE json_extract(kp.value,'$.code')=?)",f.knowledge);
 add("json_extract(c.classification,'$.question_type')=?",f.type);add("json_extract(c.classification,'$.difficulty')=?",f.difficulty);
 add(`EXISTS (${sourceExists} AND s.math_paper_id=?)`,f.paper);
 if(f.classification)conditions.push(`json_array_length(COALESCE(json_extract(c.classification,'$.knowledge_points'),'[]'))${f.classification==='classified'?'>':'='}0`);
 return {sql:conditions.length?' WHERE '+conditions.join(' AND '):'',values};
}
export const libraryProjection = `c.id,c.status,c.identity_status,c.stage,substr(c.original_text,1,700) AS text,c.classification,
 (SELECT o.id FROM question_occurrences o JOIN source_documents s ON s.id=o.source_document_id WHERE o.canonical_question_id=c.id AND s.scope_id=c.scope_id AND o.mapping_status!='detached' AND o.content_revision_id=c.current_revision_id AND o.image_key IS NOT NULL AND o.image_key!='' ORDER BY o.created_at,o.id LIMIT 1) AS image_occurrence_id,
 (SELECT json_group_array(json_object('id',s.id,'paperId',s.math_paper_id,'title',s.title)) FROM source_documents s WHERE s.scope_id=c.scope_id AND EXISTS(SELECT 1 FROM question_occurrences o WHERE o.source_document_id=s.id AND o.canonical_question_id=c.id AND o.mapping_status!='detached')) AS sources`;

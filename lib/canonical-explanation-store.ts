import { libraryBase } from './math-library-query';
import { explanationContentSchema, type SavedExplanation } from './question-explanation';

export class CanonicalExplanationError extends Error { constructor(message: string, public status: number) { super(message); } }
export class CanonicalExplanationStore {
 constructor(private db: D1Database, private scopes: string[]) {}
 async context(id: string, expectedContentRevision: string) {
  const row=await this.db.prepare(libraryBase(this.scopes)+`SELECT c.current_revision_id,c.original_text,c.stage,
    (SELECT o.image_key FROM question_occurrences o JOIN source_documents s ON s.id=o.source_document_id AND s.scope_id=c.scope_id WHERE o.canonical_question_id=c.id AND o.content_revision_id=c.current_revision_id AND o.mapping_status!='detached' AND o.image_key IS NOT NULL AND o.image_key!='' ORDER BY o.created_at,o.id LIMIT 1) image_key
    FROM library c WHERE c.id=?`).bind(...this.scopes,id).first<{current_revision_id:string;original_text:string;stage:string;image_key:string|null}>();
  if(!row)throw new CanonicalExplanationError('题目不存在或无权访问。',404);
  if(row.current_revision_id!==expectedContentRevision)throw new CanonicalExplanationError('题目已更新，请重新打开题目后再操作。',409);
  return row;
 }
 async read(id:string,contentRevision:string):Promise<SavedExplanation|null>{
  await this.context(id,contentRevision);
  const row=await this.db.prepare('SELECT * FROM canonical_question_explanations WHERE content_revision_id=?').bind(contentRevision).first<Record<string,unknown>>();
  return row?this.public(row):null;
 }
 private public(row:Record<string,unknown>):SavedExplanation{
  return {content:explanationContentSchema.parse(JSON.parse(String(row.content))),sourceText:String(row.source_text),revision:Number(row.revision),origin:row.origin as 'ai'|'manual',model:String(row.model),reviewed:Boolean(row.reviewed),updatedAt:String(row.updated_at)};
 }
 async save(id:string,contentRevision:string,expectedRevision:number,value:Omit<SavedExplanation,'revision'|'updatedAt'>){
  const content=explanationContentSchema.parse(value.content);
  await this.context(id,contentRevision);
  const row=await this.db.prepare(`INSERT INTO canonical_question_explanations(content_revision_id,content,source_text,revision,origin,model,reviewed,updated_at)
   SELECT ?,?,?,1,?,?,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM canonical_question_explanations WHERE content_revision_id=?))
   AND EXISTS(SELECT 1 FROM canonical_questions c WHERE c.id=? AND c.current_revision_id=? AND c.subject='math' AND c.status IN ('active','provisional') AND c.scope_id IN (${this.scopes.map(()=>'?').join(',')}) AND NOT EXISTS(SELECT 1 FROM math_library_trash t WHERE t.canonical_question_id=c.id))
   ON CONFLICT(content_revision_id) DO UPDATE SET content=excluded.content,source_text=excluded.source_text,revision=canonical_question_explanations.revision+1,origin=excluded.origin,model=excluded.model,reviewed=excluded.reviewed,updated_at=excluded.updated_at
   WHERE canonical_question_explanations.revision=? RETURNING *`).bind(contentRevision,JSON.stringify(content),value.sourceText,value.origin,value.model,value.reviewed?1:0,new Date().toISOString(),expectedRevision,contentRevision,id,contentRevision,...this.scopes,expectedRevision).first<Record<string,unknown>>();
  if(!row)throw new CanonicalExplanationError('题目或解析已更新，请重新读取后再保存。',409);
  return this.public(row);
 }
}

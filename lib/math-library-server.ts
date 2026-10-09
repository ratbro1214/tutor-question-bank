import { env } from 'cloudflare:workers';
import { getD1Binding } from '@/db';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { libraryBase, libraryProjection, libraryWhere, parseLibraryFilters } from './math-library-query';
export class LibraryError extends Error {constructor(message:string,public status:number){super(message);}}
export async function libraryScopes(request:Request) {
 const user=await getChatGPTUser();if(!user)throw new LibraryError('请先登录后访问私有数学题库。',401);
 const owner=(env as unknown as Record<string,string|undefined>).PROJECT_OWNER_USER_ID;
 // The existing local authentication middleware strips client identity headers.
 const local=['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname)&&user.userId==='local_seedy';
 const projectOwner=local||Boolean(owner&&user.userId===owner);
 const rows=await getD1Binding().prepare(`SELECT id FROM question_library_scopes WHERE kind='private' AND ownership_status='known' AND scope_type!='authorized_public' AND (owner_principal_id=? OR (code='project-private' AND owner_principal_id='project_owner' AND ?=1))`).bind(user.userId,projectOwner?1:0).all<{id:string}>();
 const ids=rows.results.map(r=>r.id);const requested=new URL(request.url).searchParams.get('scope');
 if(!ids.length||(requested&&!ids.includes(requested)))throw new LibraryError('无权访问此题库范围。',403);
 return requested?[requested]:ids;
}
const parse=(value:unknown,fallback:unknown=null)=>{if(typeof value!=='string')return value??fallback;try{return JSON.parse(value);}catch{return fallback;}};
export function publicLibraryRow(row:Record<string,unknown>){const classification=parse(row.classification) as Record<string,unknown>|null;if(classification){delete classification.analysis_trace;delete classification.extracted_question;}return {...row,classification,sources:parse(row.sources,[]),imageUrl:row.image_occurrence_id?`/api/math-library/${row.id}/image/${row.image_occurrence_id}`:null};}
export async function searchLibrary(request:Request,scopeIds:string[]) {
 let filters;try{filters=parseLibraryFilters(new URL(request.url).searchParams);}catch(error){throw new LibraryError((error as Error).message,400);}
 const db=getD1Binding(),base=libraryBase(scopeIds),where=libraryWhere(filters);
 const binds=[...scopeIds,...where.values];
 const [count,rows]=await Promise.all([
 db.prepare(base+'SELECT count(*) total FROM library c'+where.sql).bind(...binds).first<{total:number}>(),
 db.prepare(base+'SELECT '+libraryProjection+' FROM library c'+where.sql+' ORDER BY c.id LIMIT ? OFFSET ?').bind(...binds,filters.pageSize,(filters.page-1)*filters.pageSize).all<Record<string,unknown>>()]);
 return {items:rows.results.map(publicLibraryRow),total:count?.total||0,page:filters.page,pageSize:filters.pageSize};
}
export async function libraryFacets(scopeIds:string[]) {
 const db=getD1Binding(),base=libraryBase(scopeIds);
 const [stats,facets,papers]=await Promise.all([
 db.prepare(base+`SELECT count(*) total,sum(CASE WHEN json_array_length(COALESCE(json_extract(classification,'$.knowledge_points'),'[]'))>0 THEN 1 ELSE 0 END) classified FROM library`).bind(...scopeIds).first<{total:number;classified:number}>(),
 db.prepare(base+`SELECT DISTINCT stage,json_extract(classification,'$.chapter') chapter,json_extract(classification,'$.knowledge_points') knowledge,json_extract(classification,'$.question_type') type,json_extract(classification,'$.difficulty') difficulty FROM library`).bind(...scopeIds).all<Record<string,unknown>>(),
 db.prepare(base+`SELECT DISTINCT s.math_paper_id id,s.title FROM source_documents s JOIN question_occurrences o ON o.source_document_id=s.id JOIN library c ON c.id=o.canonical_question_id AND c.scope_id=s.scope_id WHERE s.math_paper_id IS NOT NULL AND o.mapping_status!='detached' ORDER BY s.title`).bind(...scopeIds).all<{id:string;title:string}>()]);
 const sets={stages:new Set<string>(),types:new Set<string>(),difficulties:new Set<string>()},chapters=new Map<string,unknown>(),knowledge=new Map<string,unknown>();
 for(const r of facets.results){if(r.stage)sets.stages.add(String(r.stage));if(r.type)sets.types.add(String(r.type));if(r.difficulty)sets.difficulties.add(String(r.difficulty));const ch=parse(r.chapter) as {code:string;name:string}|null;if(ch)chapters.set(ch.code,ch);for(const kp of (parse(r.knowledge,[]) as {code:string;name:string}[]))knowledge.set(kp.code,kp);}
 return {stats:{total:stats?.total||0,classified:stats?.classified||0,unclassified:(stats?.total||0)-(stats?.classified||0),papers:papers.results.length},stages:[...sets.stages],types:[...sets.types],difficulties:[...sets.difficulties],chapters:[...chapters.values()],knowledge:[...knowledge.values()],papers:papers.results};
}
export async function libraryDetail(id:string,scopeIds:string[]) {
 const db=getD1Binding();
 const row=await db.prepare(libraryBase(scopeIds)+`SELECT ${libraryProjection},c.original_text AS text,c.current_revision_id,c.scope_id FROM library c WHERE c.id=?`).bind(...scopeIds,id).first<Record<string,unknown>>();
 if(!row)throw new LibraryError('题目不存在或无权访问。',404);
 const sources=await db.prepare(`SELECT o.id,o.question_number,o.page,o.source_locator_json,o.image_key,o.public_image_path,o.content_revision_id,o.mapping_status,s.title,s.math_paper_id,s.source_type,
 l.module_type,l.module_record_id,
 CASE WHEN pq.question_text=? THEN pq.explanation WHEN sq.extracted_question=? AND sq.deleted_at IS NULL THEN qe.content END AS explanation,
 CASE WHEN pq.id IS NOT NULL THEN pq.question_text=? WHEN sq.id IS NOT NULL THEN sq.extracted_question=? ELSE NULL END AS business_content_matches
 FROM question_occurrences o JOIN source_documents s ON s.id=o.source_document_id AND s.scope_id=?
 LEFT JOIN question_module_links l ON l.id=(SELECT l2.id FROM question_module_links l2 WHERE l2.occurrence_id=o.id AND l2.canonical_question_id=o.canonical_question_id ORDER BY l2.created_at DESC,l2.id LIMIT 1)
 LEFT JOIN paper_questions pq ON l.module_type='paper_question' AND pq.id=l.module_record_id
 LEFT JOIN questions sq ON l.module_type='student_question' AND CAST(sq.id AS TEXT)=l.module_record_id
 LEFT JOIN question_explanations qe ON qe.question_id=sq.id
 WHERE o.canonical_question_id=? AND o.mapping_status!='detached' ORDER BY o.created_at,o.id`).bind(row.text,row.text,row.text,row.text,row.scope_id,id).all<Record<string,unknown>>();
 return {...publicLibraryRow(row),sources:sources.results.map(s=>({...s,locator:parse(s.source_locator_json,{}),explanation:s.content_revision_id===row.current_revision_id?parse(s.explanation):null,imageUrl:s.image_key?`/api/math-library/${id}/image/${s.id}`:null}))};
}
export function libraryFailure(error:unknown){if(error instanceof LibraryError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});console.error('[math-library]',error);return Response.json({error:'题库查询失败，请稍后重试。'},{status:500});}

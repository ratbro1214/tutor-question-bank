import { getD1Binding } from '@/db';
import { gaokaoCatalog } from '@/lib/gaokao-catalog';
import { libraryScopes,libraryFailure } from '@/lib/math-library-server';
export async function GET(request:Request){try{
 const scopes=await libraryScopes(request),db=getD1Binding();
 const rows=(await db.prepare(`SELECT p.id,p.file_hash,count(pq.id) question_count FROM papers p JOIN source_documents s ON s.math_paper_id=p.id LEFT JOIN paper_questions pq ON pq.paper_id=p.id WHERE s.scope_id IN (${scopes.map(()=>'?').join(',')}) GROUP BY p.id`).bind(...scopes).all<{id:string;file_hash:string;question_count:number}>()).results;
 const papers=gaokaoCatalog.papers.map(p=>{const saved=rows.find(r=>r.file_hash===p.pdfSha256);return {key:p.key,year:p.year,volume:p.volume,title:p.title,questionCount:p.questions.length,importedCount:saved?.question_count||0,paperId:saved?.id||null,pdfSource:p.pdfSource,textSource:p.textSource};});
 return Response.json({notice:gaokaoCatalog.notice,papers,total:papers.reduce((n,p)=>n+p.questionCount,0),imported:papers.reduce((n,p)=>n+p.importedCount,0)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return libraryFailure(e);}}

import { getD1Binding } from '@/db';
import { LibraryError, libraryFailure, libraryScopes } from '@/lib/math-library-server';
import { GET as serveImage } from '@/app/api/images/[...key]/route';
export async function GET(request:Request,context:{params:Promise<{id:string;occurrence:string}>}){
 try{const scopes=await libraryScopes(request),{id,occurrence}=await context.params;
 const row=await getD1Binding().prepare(`SELECT o.image_key FROM question_occurrences o JOIN canonical_questions c ON c.id=o.canonical_question_id JOIN source_documents s ON s.id=o.source_document_id AND s.scope_id=c.scope_id WHERE c.id=? AND o.id=? AND c.subject='math' AND c.status IN ('active','provisional') AND o.mapping_status!='detached' AND c.scope_id IN (${scopes.map(()=>'?').join(',')})`).bind(id,occurrence,...scopes).first<{image_key:string}>();
 if(!row?.image_key)throw new LibraryError('题图不存在或无权访问。',404);
 return serveImage(request,{params:Promise.resolve({key:row.image_key.split('/')})});
 }catch(error){return libraryFailure(error);}
}

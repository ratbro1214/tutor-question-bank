import { z } from 'zod';
import { getD1Binding } from '@/db';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { libraryScopes, LibraryError } from './math-library-server';
import { SolutionStore, SolutionError } from './paper-solution-store';

export async function solutionStore(request:Request,mutation=false){
 const user=await getChatGPTUser();if(!user)throw new SolutionError('请先登录。',401);
 if(mutation&&((request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)||request.headers.get('Sec-Fetch-Site')==='cross-site'))throw new SolutionError('不允许跨站修改。',403);
 const scopes=await libraryScopes(request),db=getD1Binding();
 const legacy=await db.prepare("SELECT id FROM question_library_scopes WHERE code='project-private' AND owner_principal_id='project_owner'").first<{id:string}>();
 return new SolutionStore(db,user.userId,scopes,legacy&&scopes.includes(legacy.id)?legacy.id:null);
}
export function solutionResponse(data:unknown){return Response.json(data,{headers:{'Cache-Control':'no-store'}});}
export function solutionFailure(e:unknown){
 if(e instanceof z.ZodError)return Response.json({error:e.issues[0]?.message||'数据无效。'},{status:400});
 if(e instanceof SolutionError||e instanceof LibraryError)return Response.json({error:e.message},{status:e.status,headers:{'Cache-Control':'no-store'}});
 console.warn('[paper-solutions] operation failed');return Response.json({error:'解析操作失败，原始文件和已保存版本仍保留，请刷新重试。'},{status:500});
}

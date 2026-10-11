import { getBucket } from '@/lib/storage';
import { solutionStore,solutionFailure } from '@/lib/paper-solution-server';
export async function GET(request:Request,ctx:{params:Promise<{id:string;sourceId:string}>}){
 try{const {id,sourceId}=await ctx.params,store=await solutionStore(request),s=await store.source(id,sourceId),object=await getBucket().get(s.storage_key);
  if(!object)return new Response('文件不存在',{status:404});return new Response(object.body,{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return solutionFailure(e);}
}

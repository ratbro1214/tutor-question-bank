import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getBucket } from '@/lib/storage';
import { solutionStore,solutionResponse,solutionFailure } from '@/lib/paper-solution-server';
import { SolutionError } from '@/lib/paper-solution-store';
import { configuredExplanationProvider } from '@/lib/ai-provider';
import { advanceSolutionReview } from '@/lib/paper-solution-ai';

export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){
 try{const store=await solutionStore(request);return solutionResponse(await store.list((await ctx.params).id));}catch(e){return solutionFailure(e);}
}
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){
 let key='',saved=false;
 try{
  const store=await solutionStore(request,true),paperId=(await ctx.params).id;await store.paper(paperId);
  if(request.headers.get('Content-Type')?.includes('multipart/form-data')){
   if(Number(request.headers.get('Content-Length'))>42*1024*1024)throw new SolutionError('文件过大。',413);
   const form=await request.formData(),file=form.get('file');
   if(!(file instanceof File)||file.size===0||file.size>40*1024*1024)throw new SolutionError('请选择不超过40MB的配套解析 PDF。',400);
   const bytes=await file.arrayBuffer();if(!new TextDecoder().decode(new Uint8Array(bytes).slice(0,5)).startsWith('%PDF-'))throw new SolutionError('解析文件目前支持 PDF。',400);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
   const old=await store.db.prepare('SELECT id FROM paper_solution_sources WHERE paper_id=? AND owner_id=? AND file_hash=?').bind(paperId,store.owner,hash).first<{id:string}>();
   if(old)return solutionResponse({sourceId:old.id,reused:true});
   const id=crypto.randomUUID();key=`paper-solutions/${id}/source.pdf`;await getBucket().put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});
   const source=await store.createSource(paperId,{id,key,hash,filename:file.name.slice(0,240)});saved=source.storage_key===key;
   return solutionResponse({sourceId:source.id,reused:!saved});
  }
  const body=await request.text();if(new TextEncoder().encode(body).length>4000000)throw new SolutionError('内容超过4MB，请减少文档大小。',413);
  let raw;try{raw=JSON.parse(body);}catch{throw new SolutionError('JSON 无效。',400);}
  const input=z.object({action:z.enum(['extract','rematch','manual','match','review','decision','history']),id:z.string().uuid(),payload:z.unknown()}).strict().parse(raw);
  if(input.action==='extract'){
   const s=await store.source(paperId,input.id);
   try{return solutionResponse(await store.extract(paperId,input.id,input.payload));}
   catch(e){await store.db.batch([store.db.prepare("UPDATE paper_solution_sources SET status='failed',error=? WHERE id=? AND status<>'ready'").bind(e instanceof SolutionError?e.message:'解析切割失败，原文件保留，可重试。',s.id),store.db.prepare("UPDATE paper_import_batches SET status='failed' WHERE id=? AND status<>'completed'").bind(s.batch_id)]);throw e;}
  }
  if(input.action==='manual')return solutionResponse(await store.manual(paperId,input.id,input.payload));
  if(input.action==='rematch')return solutionResponse(await store.rematch(paperId,input.id));
  if(input.action==='match')return solutionResponse(await store.writeMatch(paperId,input.id,input.payload));
  if(input.action==='review')return solutionResponse(await advanceSolutionReview(store,paperId,input.id,input.payload,configuredExplanationProvider(env as unknown as Record<string,unknown>),request.signal));
  if(input.action==='decision')return solutionResponse(await store.reviewDecision(paperId,input.id,input.payload));
  await store.entry(paperId,input.id);
  return solutionResponse((await store.db.prepare('SELECT revision,snapshot,reviewer,created_at FROM paper_solution_match_history WHERE entry_id=? ORDER BY revision DESC').bind(input.id).all()).results);
 }catch(e){return solutionFailure(e);}finally{
  if(key&&!saved){
   // A committed row must keep its file even if the response/readback failed.
   try{const exists=await (await solutionStore(request)).db.prepare('SELECT id FROM paper_solution_sources WHERE storage_key=?').bind(key).first();if(!exists)await getBucket().delete(key);}catch{/* retain uncertain file rather than break a committed source */}
  }
 }
}

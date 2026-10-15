import { env } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { getD1Binding } from '@/db';
import { libraryScopes, libraryFailure, libraryDetail, libraryTrashStore } from '@/lib/math-library-server';
import { CanonicalExplanationStore, CanonicalExplanationError } from '@/lib/canonical-explanation-store';
import { generateExplanation, ExplanationGenerationError } from '@/lib/explanation-generation';
import { configuredExplanationProvider } from '@/lib/ai-provider';
import { explanationContentSchema } from '@/lib/question-explanation';
import { getBucket } from '@/lib/storage';
type Context={params:Promise<{id:string}>};
const generateInput=z.object({questionText:z.string().trim().min(1).max(16000),expectedRevision:z.number().int().nonnegative()});
const saveInput=z.object({sourceText:z.string().trim().min(1).max(16000),expectedRevision:z.number().int().nonnegative(),content:explanationContentSchema,origin:z.enum(['ai','manual']),model:z.string().max(200),reviewed:z.boolean()}).refine(v=>!v.reviewed||v.content.status==='ready','请补全题目信息后再确认解析。');
function failure(error:unknown){if(error instanceof CanonicalExplanationError||error instanceof ExplanationGenerationError)return Response.json({error:error.message},{status:error.status});if(error instanceof z.ZodError||error instanceof SyntaxError)return Response.json({error:'解析输入无效，请检查内容。'},{status:400});return libraryFailure(error);}
async function store(request:Request,context:Context,write=false){
 if(write)await libraryTrashStore(request); // Reuse login/scope and same-origin mutation checks.
 const scopes=await libraryScopes(request),id=(await context.params).id,revision=new URL(request.url).searchParams.get('contentRevision')||'';
 const service=new CanonicalExplanationStore(getD1Binding(),scopes);await service.context(id,revision);
 return {service,scopes,id,revision};
}
export async function GET(request:Request,context:Context){try{
 const s=await store(request,context),saved=await s.service.read(s.id,s.revision);
 if(saved)return Response.json({explanation:saved},{headers:{'Cache-Control':'no-store'}});
 const detail=await libraryDetail(s.id,s.scopes),source=detail.sources.find(s=>s.explanation);
 return Response.json({explanation:source?.explanation?{content:source.explanation,sourceText:(await s.service.context(s.id,s.revision)).original_text,revision:0,origin:'external',model:'',reviewed:source.explanationReviewed===true,updatedAt:''}:null},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){try{
 const s=await store(request,context,true),input=generateInput.parse(await request.json()),current=await s.service.read(s.id,s.revision);
 if((current?.revision||0)!==input.expectedRevision)throw new CanonicalExplanationError('解析已更新，请重新读取后再生成。',409);
 const question=await s.service.context(s.id,s.revision),config=configuredExplanationProvider(env as unknown as Record<string,unknown>);
 if(!question.image_key)throw new CanonicalExplanationError('没有可用原图，可以先手工填写解析。',422);
 const image=await getBucket().get(question.image_key);
 if(!image||image.size>8*1024*1024)throw new CanonicalExplanationError('原图无法读取或过大，可以先手工填写解析。',422);
 const content=await generateExplanation({questionText:input.questionText,educationStage:question.stage||'高中',imageDataUrl:`data:${image.httpMetadata?.contentType||'image/png'};base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`},config,request.signal);
 let explanation;
 try{explanation=await s.service.save(s.id,s.revision,input.expectedRevision,{content,sourceText:input.questionText,origin:'ai',model:config.model,reviewed:false});}
 catch(error){if(error instanceof CanonicalExplanationError&&error.status===409)return Response.json({content,sourceText:input.questionText,model:config.model,error:'生成期间题目或解析已更新。本次结果已保留在本机草稿，请核对后再保存。'},{status:409});throw error;}
 return Response.json({content,sourceText:input.questionText,model:config.model,explanation},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function PUT(request:Request,context:Context){try{
 const s=await store(request,context,true),input=saveInput.parse(await request.json());
 return Response.json({explanation:await s.service.save(s.id,s.revision,input.expectedRevision,input)},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}

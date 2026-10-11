import { z } from 'zod';
import { getD1Binding } from '@/db';
import { getBucket } from '@/lib/storage';
import { batchResult, privateScope, attachPaper, registerItem, confirmItem, ImportConflict } from '@/lib/paper-batch-server';
import { solutionStore } from '@/lib/paper-solution-server';
import { SolutionError } from '@/lib/paper-solution-store';
import { LibraryError } from '@/lib/math-library-server';
const uuid=z.string().uuid();
const requestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),filenames:z.array(z.string().min(1).max(240)).min(1).max(20)}),
 z.object({action:z.literal('attach'),batchId:uuid,fileId:uuid,paperId:uuid}),
 z.object({action:z.literal('item'),batchId:uuid,fileId:uuid,number:z.number().int().min(1).max(200),questionId:uuid.optional(),error:z.string().max(1000).optional()}),
 z.object({action:z.literal('finishFile'),batchId:uuid,fileId:uuid,status:z.enum(['completed','needs_review','failed']),error:z.string().max(1000).default('')}),
 z.object({action:z.literal('finish'),batchId:uuid}),
 z.object({action:z.literal('confirm'),batchId:uuid,itemId:uuid,observedHash:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true),applicability:z.object({formula:z.boolean(),options:z.boolean(),subquestions:z.boolean(),visual:z.boolean(),cross_page:z.boolean()})}),
]);
export async function GET(request:Request) {
 try {
  const db=getD1Binding(),id=new URL(request.url).searchParams.get('id');
  const scope=await privateScope(db);
  if(!(await solutionStore(request)).scopes.includes(scope.id))throw new SolutionError('无权访问此批次范围。',403);
  if(id) {
   const batchId=uuid.parse(id);
   if(!await db.prepare('SELECT id FROM paper_import_batches WHERE id=? AND scope_id=?').bind(batchId,scope.id).first()) throw new ImportConflict('批次不存在或 scope 不符。');
   return Response.json(await batchResult(db,batchId),{headers:{'Cache-Control':'no-store'}});
  }
  return Response.json({batches:(await db.prepare('SELECT id,status,created_at FROM paper_import_batches WHERE scope_id=? ORDER BY rowid DESC LIMIT 20').bind(scope.id).all()).results},{headers:{'Cache-Control':'no-store'}});
 } catch(error) {return failure(error);}
}
export async function POST(request:Request) {
 try {
  const input=requestSchema.parse(await request.json()),db=getD1Binding();
  const scope=await privateScope(db);
  if(!(await solutionStore(request,true)).scopes.includes(scope.id))throw new SolutionError('无权修改此批次范围。',403);
  let id:string;
  if(input.action==='create') {
   id=crypto.randomUUID();
   await db.batch([db.prepare('INSERT INTO paper_import_batches(id,scope_id) VALUES(?,?)').bind(id,scope.id),...input.filenames.map((name,position)=>db.prepare('INSERT INTO paper_import_files(id,batch_id,position,filename) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,position,name))]);
  } else {
   id=input.batchId;
   if(!await db.prepare('SELECT id FROM paper_import_batches WHERE id=? AND scope_id=?').bind(id,scope.id).first()) throw new ImportConflict('批次不存在或 scope 不符。');
   if(input.action==='attach') await attachPaper(db,id,input.fileId,input.paperId);
   if(input.action==='item') await registerItem(db,getBucket(),id,input.fileId,input);
   if(input.action==='confirm') await confirmItem(db,getBucket(),id,input.itemId,input.applicability,input.observedHash);
   if(input.action==='finishFile') await db.batch([db.prepare("UPDATE paper_import_files SET status=?,error=? WHERE id=? AND batch_id=? AND status IN ('pending','processing')").bind(input.status,input.error,input.fileId,id)]);
   if(input.action==='finish') {
    const result=await batchResult(db,id);
    if(result.files.some(f=>f.status==='pending'||f.status==='processing')) throw new ImportConflict('仍有文件未完成，批次结果已保存，可继续处理。');
    const status=result.files.every(f=>f.status==='failed')?'failed':result.counts.failedFiles||result.counts.FAILED||result.files.some(f=>f.status==='needs_review')?'completed_with_errors':'completed';
    await db.batch([db.prepare('UPDATE paper_import_batches SET status=? WHERE id=?').bind(status,id)]);
   }
  }
  return Response.json(await batchResult(db,id));
 } catch(error) {return failure(error);}
}
function failure(error:unknown) {
 if(error instanceof SolutionError||error instanceof LibraryError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
 if(error instanceof z.ZodError||error instanceof SyntaxError) return Response.json({error:'批次参数无效。'},{status:400});
 if(error instanceof ImportConflict||error instanceof Error&&error.name==='AssertionError') return Response.json({error:error.message},{status:409});
 console.warn('paper_batch_failed',{name:error instanceof Error?error.name:'unknown'});
 return Response.json({error:'批量结果保存失败。已保存内容保留，请刷新查看。'},{status:500});
}

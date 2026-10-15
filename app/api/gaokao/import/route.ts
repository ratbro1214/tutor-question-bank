import { z } from 'zod';
import { getD1Binding } from '@/db';
import { getBucket } from '@/lib/storage';
import { solutionStore,solutionFailure } from '@/lib/paper-solution-server';
import { SolutionError } from '@/lib/paper-solution-store';
import { cropRegionSchema } from '@/lib/paper';
import { gaokaoPaper,digest } from '@/lib/gaokao-catalog';
import { explanationContentSchema } from '@/lib/question-explanation';
const locatorSchema=z.array(z.object({number:z.number().int().positive(),regions:z.array(cropRegionSchema).min(1).max(20),imageSha256:z.string().regex(/^[a-f0-9]{64}$/),combinedBlock:z.boolean(),locators:z.array(z.string().max(200)).max(20)}).strict()).max(25);
export async function POST(request:Request){
 const savedKeys:string[]=[];let committed=false;
 try{
  const store=await solutionStore(request,true),db=getD1Binding(),form=await request.formData();
  const paper=gaokaoPaper(String(form.get('key')||''));if(!paper)throw new SolutionError('该试卷不在已整理的十年资料包中。',400);
  const sourceFile=form.get('source');if(!(sourceFile instanceof File)||sourceFile.size>40*1024*1024)throw new SolutionError('原卷文件无效。',400);
  const sourceBytes=await sourceFile.arrayBuffer();if(await digest(sourceBytes)!==paper.pdfSha256)throw new SolutionError('原卷校验值不符，已拒绝导入。',400);
  const locators=locatorSchema.parse(JSON.parse(String(form.get('locators')||'[]')));
  if(locators.length!==paper.questions.length||new Set(locators.map(q=>q.number)).size!==locators.length||paper.questions.some(q=>!locators.some(l=>l.number===q.number)))throw new SolutionError('题号不完整或重复，已拒绝导入。',400);
  const existing=await db.prepare('SELECT id FROM papers WHERE file_hash=?').bind(paper.pdfSha256).first<{id:string}>();
  if(existing){await store.paper(existing.id);const count=await db.prepare('SELECT count(*) total FROM paper_questions WHERE paper_id=?').bind(existing.id).first<{total:number}>();const imported=await db.prepare("SELECT metadata FROM source_documents WHERE math_paper_id=?").bind(existing.id).first<{metadata:string}>();if(count?.total===paper.questions.length&&JSON.parse(imported?.metadata||'{}').corpus==='gaokao-2017-2026-v1')return Response.json({paperId:existing.id,count:count.total,reused:true});throw new SolutionError('已存在同一原卷，但不是本批完整导入；保留原内容，请先核对。',409);}
  const scope=store.legacyScope||store.scopes[0],paperId=crypto.randomUUID(),sourceId=crypto.randomUUID(),now=new Date().toISOString(),sourceKey=`papers/${paperId}/source`;
  const metadata={corpus:'gaokao-2017-2026-v1',year:paper.year,volume:paper.volume,textSource:paper.textSource,originalSource:paper.pdfSource,textSha256:paper.texSha256,reviewed:false,importOrigin:'external',licenseNotice:'试题原权利归命题方；上游整理内容分别为 CC BY 4.0 与 CC BY-SA 4.0。'};
  const statements=[db.prepare('INSERT INTO papers(id,title,original_filename,source_key,source_type,file_hash,created_at) VALUES(?,?,?,?,?,?,?)').bind(paperId,paper.title,paper.originalFilename,sourceKey,'application/pdf',paper.pdfSha256,now),db.prepare("INSERT INTO source_documents(id,scope_id,source_type,title,math_paper_id,file_storage,storage_key,original_filename,mime_type,file_hash,source_url,license,metadata) VALUES(?,?,'math_paper',?,?,'r2',?,?,'application/pdf',?,?,?,?)").bind(sourceId,scope,paper.title,paperId,sourceKey,paper.originalFilename,paper.pdfSha256,paper.pdfSource,'CC BY 4.0 (original collection); CC BY-SA 4.0 (compiled text)',JSON.stringify(metadata))];
  // Validate every uploaded crop before writing storage or any database row.
  const crops=[];
  for(const q of paper.questions){const file=form.get('q'+q.number),locator=locators.find(l=>l.number===q.number)!;if(!(file instanceof File)||file.size===0||file.size>8*1024*1024)throw new SolutionError(`第 ${q.number} 题原图无效。`,400);const bytes=await file.arrayBuffer(),prefix=new Uint8Array(bytes);if(prefix[0]!==137||prefix[1]!==80||prefix[2]!==78||prefix[3]!==71||await digest(bytes)!==locator.imageSha256)throw new SolutionError(`第 ${q.number} 题原图校验失败。`,400);crops.push({q,locator,bytes});}
  await getBucket().put(sourceKey,sourceBytes,{httpMetadata:{contentType:'application/pdf'}});savedKeys.push(sourceKey);
  for(const {q,locator,bytes}of crops){
   const id=crypto.randomUUID(),canonical=crypto.randomUUID(),revision=crypto.randomUUID(),occurrence=crypto.randomUUID(),key=`papers/${paperId}/questions/${id}`;
   await getBucket().put(key,bytes,{httpMetadata:{contentType:'image/png'}});savedKeys.push(key);
   const classification=JSON.stringify(q.classification),regions=JSON.stringify(locator.regions);
   const content=explanationContentSchema.parse({status:'ready',answer:q.answer||'具体结论见下方参考解析。',approach:'外部公开资料提供的参考解答，尚未经本项目教师核查。',steps:[{title:q.solution?'来源参考解析':'参考答案说明',content:q.solution||'上游资料只提供参考答案，未附详细解题步骤。'}],teachingNotes:'',commonMistakes:'',verification:'请对照原卷核对题干、公式、图形与结论。',alternativeMethod:'',missingInformation:''});
   const hash=await digest(q.text),payload={classification:q.classification,externalSource:metadata,reviewed:false,normalized_text_hash:hash};
   statements.push(
    db.prepare("INSERT INTO canonical_questions(id,scope_id,subject,status,created_at,updated_at) VALUES(?,?,'math','provisional',?,?)").bind(canonical,scope,now,now),
    db.prepare("INSERT INTO canonical_question_revisions(id,canonical_question_id,revision,subject,education_stage,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,identity_status,change_reason,created_by,created_at) VALUES(?,?,1,'math','高中',?,?,?,'gaokao-curated-v1','gaokao-source-v1',?,'needs_review','外部真题导入，保留原卷与题图；待教师核查',?,?)").bind(revision,canonical,q.text,q.text,hash,JSON.stringify(payload),'external-import',now),
    db.prepare('UPDATE canonical_questions SET current_revision_id=? WHERE id=?').bind(revision,canonical),
    db.prepare("INSERT INTO paper_questions(id,paper_id,question_number,regions,image_key,question_text,classification,explanation,model,revision,status,error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,'completed',?,?)").bind(id,paperId,q.number,regions,key,q.text,classification,JSON.stringify(content),'external:Gaokao-Math-Problems-Compilation',locator.combinedBlock?'原卷相邻题号被识别在同一段，题图保留相邻题内容；请按题号核对。':'',now),
    db.prepare("INSERT INTO question_occurrences(id,canonical_question_id,content_revision_id,source_document_id,source_type,occurrence_key,question_number,page,source_locator_json,image_key,raw_text,metadata,mapping_status) VALUES(?,?,?,?,'math_paper',?,?,?,?,?,?,?,'provisional')").bind(occurrence,canonical,revision,sourceId,'question:'+q.number,String(q.number),locator.regions[0].page,JSON.stringify({regions:locator.regions,mineruLocators:locator.locators}),key,q.text,JSON.stringify({...metadata,combinedBlock:locator.combinedBlock,imageSha256:locator.imageSha256})),
    db.prepare("INSERT INTO question_module_links(id,module_type,module_record_id,canonical_question_id,occurrence_id,legacy_paper_question_id,observed_source_hash) VALUES(?,'paper_question',?,?,?,?,?)").bind(crypto.randomUUID(),id,canonical,occurrence,id,hash)
   );
  }
  // D1 batch is atomic: incomplete papers never become visible in the bank.
  await db.batch(statements);committed=true;
  return Response.json({paperId,count:paper.questions.length,reused:false},{status:201});
 }catch(e){return solutionFailure(e);}finally{if(!committed&&savedKeys.length)await Promise.all(savedKeys.map(key=>getBucket().delete(key).catch(()=>{})));}
}

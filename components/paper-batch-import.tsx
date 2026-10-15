'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildQuestionCrops, locateQuestionAnchors, type PaperSummary, type PaperQuestion } from '@/lib/paper';
import { openPaperDocument, cropQuestionImage } from '@/lib/pdf-browser';
import { batchStatusLabel, type BatchHistory, type BatchResult, type BatchItem, type ReviewApplication } from '@/lib/paper-batch';
import { Button } from '@/components/ui/button';
import { readApiResponse } from '@/lib/api-response';

async function api<T>(url:string,body?:object|FormData):Promise<T> {
 const response=await fetch(url,{cache:'no-store',...(body?{method:'POST',...(body instanceof FormData?{body}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}:{})});
 return readApiResponse<T>(response);
}
export function PaperBatchImport() {
 const [files,setFiles]=useState<File[]>([]),[result,setResult]=useState<BatchResult|null>(null),[history,setHistory]=useState<BatchHistory[]>([]);
 const [busy,setBusy]=useState(''),[error,setError]=useState('');const active=useRef(false),alive=useRef(true);
 const refreshHistory=useCallback(()=>api<{batches:typeof history}>('/api/papers/batches').then(r=>{if(alive.current)setHistory(r.batches);}),[]);
 useEffect(()=>{alive.current=true;void refreshHistory().catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;};},[refreshHistory]);
 async function action(body:object) {const r=await api<BatchResult>('/api/papers/batches',body);if(alive.current)setResult(r);return r;}
 async function run() {
  if(active.current||!files.length)return;active.current=true;setBusy('正在创建批次…');setError('');
  try {
   const batch=await action({action:'create',filenames:files.map(f=>f.name)});
   for(const [position,file] of files.entries()) {
    if(!alive.current)break;
    const entry=batch.files[position];let doc:Awaited<ReturnType<typeof openPaperDocument>>|null=null;
    try {
     setBusy(`正在处理 ${position+1}/${files.length}：${file.name}`);
     if(file.size>40*1024*1024||file.size===0)throw Error('PDF 文件大小须为 1 字节至 40MB。');
     if(!new TextDecoder().decode(await file.slice(0,8).arrayBuffer()).startsWith('%PDF-'))throw Error('文件内容不是 PDF。');
     const form=new FormData();form.set('file',file);form.set('title',file.name.replace(/\.pdf$/i,''));
     const upload=await api<{paper:PaperSummary}>('/api/papers',form);
     await action({action:'attach',batchId:batch.id,fileId:entry.id,paperId:upload.paper.id});
     doc=await openPaperDocument(file);
     const crops=buildQuestionCrops(doc.pages,locateQuestionAnchors(doc.pages));
     if(!crops.length) {await action({action:'finishFile',batchId:batch.id,fileId:entry.id,status:'needs_review',error:'无可定位题号的文本层；扫描 PDF 暂不支持自动切题。请在套卷工作台手动框选。'});continue;}
     for(const crop of crops) {
      if(!alive.current)break;
      setBusy(`${file.name} · 正在保存第 ${crop.number} 题`);
      try {
       // Existing upload/crop routes own business persistence. Never request replacement or AI analysis.
       const blob=await cropQuestionImage(doc,crop.regions),form=new FormData();
       form.set('image',new File([blob],`question-${crop.number}.jpg`,{type:'image/jpeg'}));
       form.set('metadata',JSON.stringify({number:crop.number,regions:crop.regions,text:crop.text.slice(0,16000)}));
       const saved=await api<{question:PaperQuestion}>(`/api/papers/${upload.paper.id}/questions`,form);
       await action({action:'item',batchId:batch.id,fileId:entry.id,number:crop.number,questionId:saved.question.id});
      } catch(e) {await action({action:'item',batchId:batch.id,fileId:entry.id,number:crop.number,error:e instanceof Error?e.message:'题目处理失败。'});}
     }
     if(alive.current)await action({action:'finishFile',batchId:batch.id,fileId:entry.id,status:'completed'});
    } catch(e) {await action({action:'finishFile',batchId:batch.id,fileId:entry.id,status:'failed',error:e instanceof Error?e.message:'文件处理失败。'});}
    finally {await doc?.destroy();}
   }
   if(alive.current)await action({action:'finish',batchId:batch.id});
   window.dispatchEvent(new Event('paper-import-completed'));
   await refreshHistory();
  } catch(e) {if(alive.current)setError(e instanceof Error?e.message:'批次处理失败。');}
  finally {active.current=false;if(alive.current)setBusy('');}
 }
 async function confirm(item:BatchItem,applicability:ReviewApplication) {
  if(!result||active.current)return;active.current=true;setBusy(`正在确认第 ${item.question_number} 题`);setError('');
  try {await action({action:'confirm',batchId:result.id,itemId:item.id,observedHash:item.observed_hash,confirmed:true,applicability});}
  catch(e) {setError(e instanceof Error?e.message:'确认失败。');}
  finally {active.current=false;setBusy('');}
 }
 const counts=result?.counts;
 return <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
  <div><h2 className="text-xl font-semibold">批量导入试卷</h2><p className="mt-2 text-sm text-slate-500">最多 20 份 PDF，每份不超过 40MB、80 页。导入后请核对题目。</p></div>
  <div className="flex flex-wrap items-center gap-3"><input aria-label="选择多份数学试卷 PDF" type="file" accept="application/pdf,.pdf" multiple disabled={!!busy} onChange={e=>{const selected=Array.from(e.target.files||[]);if(selected.length>20){setError('一次最多 20 份 PDF。');setFiles([]);}else{setFiles(selected);setError('');}}}/><Button disabled={!!busy||!files.length} onClick={()=>void run()}>导入 {files.length||''} 份 PDF</Button></div>
  {busy&&<p role="status">{busy}，请保持页面打开。</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}
  {!!history.length&&<label className="flex min-w-0 flex-col gap-2 text-sm sm:flex-row sm:items-center"><span className="shrink-0 text-slate-500">导入记录</span><select aria-label="按试卷名查看导入记录" disabled={!!busy} className="min-w-0 w-full max-w-2xl truncate rounded-lg border border-slate-200 bg-white px-3 py-2" value={history.some(b=>b.id===result?.id)?result!.id:''} onChange={e=>{if(e.target.value)void api<BatchResult>(`/api/papers/batches?id=${e.target.value}`).then(setResult).catch(e=>setError(e.message));}}><option value="">选择试卷查看结果</option>{history.map(b=>{const names=b.filenames.map(n=>n.replace(/\.pdf$/i,''));const date=new Date(/Z$|[+-]\d\d:\d\d$/.test(b.created_at)?b.created_at:b.created_at.replace(' ','T')+'Z');return <option key={b.id} value={b.id} title={b.filenames.join('、')}>{names[0]||'未命名试卷'}{names.length>1?` 等 ${names.length} 份`:''} · {date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})} · {batchStatusLabel(b.status)}</option>;})}</select></label>}
  {result&&counts&&<><div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm"><span>{counts.pdfs} 份试卷 · {counts.questions} 道题</span><span>新增 {counts.NEW}</span><span>已关联 {counts.DUPLICATE}</span><span className={counts.NEEDS_REVIEW?'text-amber-700':''}>待核对 {counts.NEEDS_REVIEW}</span>{!!(counts.FAILED||counts.failedFiles)&&<span className="text-red-700">失败：{counts.FAILED} 道题、{counts.failedFiles} 份文件</span>}</div>
   {result.files.map(f=>{const tally=(s:string)=>f.items.filter(i=>i.status===s).length;return <details key={f.id} className="rounded border p-3"><summary className="cursor-pointer font-medium">{f.filename.replace(/\.pdf$/i,'')}<span className="ml-3 text-sm font-normal text-slate-500">{f.items.length} 题 · {batchStatusLabel(f.status)}{tally('NEEDS_REVIEW')?` · ${tally('NEEDS_REVIEW')} 题待核对`:''}{tally('FAILED')?` · ${tally('FAILED')} 题失败`:''}</span></summary>
    {f.error&&<p className="my-2 text-red-700">{f.error}</p>}{f.paper_id&&<Link className="my-2 inline-block text-blue-700 underline" href={`/papers/${f.paper_id}`}>打开原卷与切题工作台</Link>}
    <div className="space-y-3">{f.items.map(i=><Item key={i.id} item={i} busy={!!busy} onConfirm={app=>void confirm(i,app)}/>)}</div>
   </details>;})}
  </>}
 </section>;
}
function Item({item:i,busy,onConfirm}:{item:BatchItem;busy:boolean;onConfirm:(a:ReviewApplication)=>void}) {
 const [review,setReview]=useState(false),[confirmed,setConfirmed]=useState(false),[app,setApp]=useState<Partial<ReviewApplication>>({});
 const regions=i.regions?JSON.parse(i.regions):[];
 return <article className="rounded border bg-slate-50 p-3"><div className="flex gap-4">
  {i.image_key&&<a target="_blank" rel="noreferrer" href={`/api/images/${encodeURIComponent(i.image_key)}`}><img loading="lazy" className="max-h-32 w-40 object-contain" alt={`第 ${i.question_number} 题裁切`} src={`/api/images/${encodeURIComponent(i.image_key)}`}/></a>}
  <div className="min-w-0"><p className="font-medium">第 {i.question_number} 题 · {batchStatusLabel(i.status)}{(i.duplicate_canonical_id||i.duplicate_item_id)&&' · 文字相同，需核对图形'}</p><p className="my-1 whitespace-pre-wrap text-sm">{i.question_text?.slice(0,240)||'无可用题干'}</p>{i.reason&&<details className="text-sm text-slate-500"><summary className="cursor-pointer">处理详情</summary><p className="mt-2">{i.reason}</p></details>}</div>
 </div>
 {i.status==='NEEDS_REVIEW'&&i.paper_question_id&&<><button className="mt-2 text-blue-700 underline" disabled={busy} onClick={()=>setReview(!review)}>核对后确认此题</button>{review&&<div className="mt-3 space-y-3">
  <p className="whitespace-pre-wrap text-sm">完整题干：{i.question_text}</p><p className="text-xs text-slate-500">题目共 {regions.length} 个裁切片段，请核对续页。</p>
  <p className="text-sm">请打开上方原卷与题图，逐项明确是否适用；有任何不确定则保持待审核。</p>
  {(['formula','options','subquestions','visual','cross_page'] as const).map((key,index)=><label key={key} className="mr-3 inline-block text-sm">{['公式','选项','小问','必要图形','跨页'][index]}<select aria-label={key} className="ml-2 border" value={app[key]===undefined?'unknown':String(app[key])} onChange={e=>setApp({...app,[key]:e.target.value==='unknown'?undefined:e.target.value==='true'})}><option value="unknown">未确认</option><option value="true">适用，已确认完整</option><option value="false">已确认不适用</option></select></label>)}
  <label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 已对照原卷核对题干、公式、选项、小问、图形及续页，确认完整且来源正确，加入我的题库。</label>
  <Button disabled={busy||!confirmed||Object.values(app).filter(v=>typeof v==='boolean').length!==5} onClick={()=>onConfirm(app as ReviewApplication)}>确认并入库</Button>
 </div>}</>}
 </article>;
}

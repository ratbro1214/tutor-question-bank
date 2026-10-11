"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { MathText } from './math-text';
import { readApiResponse } from '@/lib/api-response';
import { openPaperDocument, cropQuestionImage } from '@/lib/pdf-browser';
import type { SolutionEntry, MatchProposal, SolutionReview, MatchQuestion } from '@/lib/paper-solutions';
import { splitSolutions } from '@/lib/paper-solutions';
import type { SolutionSource, StoredSolution, StoredReview } from '@/lib/paper-solution-store';

type Entry=Omit<StoredSolution,'data'|'proposal'>&{data:SolutionEntry;proposal:MatchProposal};
type Review=Omit<StoredReview,'result'|'teacher_result'>&{result:SolutionReview|null;teacher_result:SolutionReview|null};
type Data={sources:(Omit<SolutionSource,'storage_key'|'pages'>&{url:string})[];entries:Entry[];reviews:Review[];questions:MatchQuestion[]};
const inputClass='w-full rounded-lg border border-slate-200 bg-white p-3 text-sm';
const labels:Record<string,string>={MATCHED:'可靠匹配，待教师确认',NEEDS_REVIEW:'存在疑点，待审核',UNMATCHED:'未匹配',CONFIRMED:'教师已确认',no_obvious_error:'暂未发现明显错误',suspicious:'存在可疑步骤',error_detected:'检测到错误，待教师核查',insufficient:'信息不足，无法可靠判断',keep_original:'保留原解法',consider_alternative:'参考另一种解法',keep_both:'两种方法均保留',teacher_check:'需要教师核查'};
async function api<T>(url:string,init?:RequestInit){return readApiResponse<T>(await fetch(url,{cache:'no-store',...init}));}
export function PaperSolutionReview({paperId}:{paperId:string}){
 const url=`/api/papers/${paperId}/solutions`,[data,setData]=useState<Data|null>(null),[selected,setSelected]=useState(''),[sourceId,setSourceId]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const [questionId,setQuestionId]=useState(''),[teacherText,setTeacherText]=useState(''),[tab,setTab]=useState('original'),[preview,setPreview]=useState(''),[history,setHistory]=useState(''),[manualText,setManualText]=useState(''),[manualPage,setManualPage]=useState(1),[manualNumber,setManualNumber]=useState(''),[editAI,setEditAI]=useState<SolutionReview|null>(null);
 const entry=data?.entries.find(e=>e.id===selected),source=data?.sources.find(s=>s.id===(entry?.source_id||sourceId)),q=data?.questions.find(q=>q.id===(questionId||entry?.question_id));
 const reviews=data?.reviews.filter(r=>r.entry_id===selected)||[],review=reviews.at(-1),result=review?.teacher_result||review?.result;
 async function reload(preferredSource=sourceId){const d=await api<Data>(url);setData(d);setSelected(v=>d.entries.some(e=>e.id===v)?v:d.entries.find(e=>e.source_id===preferredSource)?.id||'');setSourceId(v=>v||d.sources[0]?.id||'');return d;}
 useEffect(()=>{void api<Data>(url).then(d=>{setData(d);setSelected(d.entries[0]?.id||'');setSourceId(d.sources[0]?.id||'');}).catch(e=>setError(e.message));},[url]);
 useEffect(()=>{setQuestionId(entry?.question_id||entry?.proposal.candidates?.[0]?.questionId||'');setTeacherText(entry?.teacher_text??entry?.data.text??'');setHistory('');setEditAI(null);},[entry]);
 useEffect(()=>{
  setPreview('');if(!entry||!source)return;let disposed=false,objectUrl='';
  void(async()=>{const response=await fetch(source.url);if(!response.ok)throw Error('解析原文件读取失败。');const doc=await openPaperDocument(new Blob([await response.arrayBuffer()],{type:'application/pdf'}));
   try{if(disposed)return;const blob=await cropQuestionImage(doc,entry.data.regions);if(!disposed){objectUrl=URL.createObjectURL(blob);setPreview(objectUrl);}}finally{await doc.destroy();}
  })().catch(()=>{});return()=>{disposed=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[entry,source]);
 async function action(action:string,id:string,payload:unknown){return api<unknown>(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id,payload})});}
 async function task(label:string,fn:()=>Promise<void>){if(busy)return;setBusy(label);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作失败。');}finally{setBusy('');}}
 async function upload(file:File){await task('保存配套解析…',async()=>{const form=new FormData();form.set('file',file);const r=await api<{sourceId:string}>(url,{method:'POST',body:form});setSourceId(r.sourceId);setSelected('');await reload(r.sourceId);});}
 async function extract(){if(!sourceId)return;await task('按文档题号和位置切割解析…',async()=>{
  const s=data?.sources.find(s=>s.id===sourceId);if(!s)return;const response=await fetch(s.url);if(!response.ok)throw Error('原文件读取失败。');const doc=await openPaperDocument(new Blob([await response.arrayBuffer()],{type:'application/pdf'}));
  try{
   const entries=splitSolutions(doc.pages);
   if(!entries.some(e=>e.number!==null)){
    setBusy('文字层不足，正在本地识别题号、解析和跨页位置…');
    type OCRJob={jobId:string;status:string;pages?:typeof doc.pages;error?:string};
    let job=await api<OCRJob>('/__local/solution-ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paperId,sourceId:s.id})});
    while(job.status==='running'){await new Promise(r=>setTimeout(r,1500));job=await api<OCRJob>(`/__local/solution-ocr?job=${job.jobId}`);}
    if(job.status!=='completed'||!job.pages)throw Error(job.error||'本地识别未完成，请重试。');
    await action('extract',s.id,{method:'local_ocr',pages:job.pages});
   }else await action('extract',s.id,doc.pages);
  }finally{await doc.destroy();}await reload();
 });}
 async function confirm(e:Entry,question:string,text:string,yes=true){await action('match',e.id,{operationId:crypto.randomUUID(),expectedRevision:e.revision,questionId:question||null,teacherText:text===e.data.text?null:text,confirm:yes});}
 async function generate(mode:'basic'|'deep'){
  if(!entry)return;
  if(questionId!==entry.question_id||teacherText!==(entry.teacher_text??entry.data.text)){setError('匹配或教师副本尚未保存，请先确认并保存，再评审。');return;}
  await task(mode==='basic'?'核查原解析…':'分阶段评审解法与通法…',async()=>{
   const pending=reviews.findLast(r=>r.match_revision===entry.revision&&r.mode===mode&&r.status!=='completed'),operationId=pending?.operation_id||crypto.randomUUID(),payload={operationId,expectedRevision:entry.revision,mode};
   const r=await action('review',entry.id,payload) as StoredReview;await reload();
   if(r.status==='methods_pending'){setBusy('核查已保存，正在比较解法和提炼通法…');await action('review',entry.id,payload);await reload();}setTab('quality');
  });
 }
 return <div className="space-y-6">
  <Link className="text-sm text-terracotta-800" href={`/papers/${paperId}`}>← 返回试卷切题与分类</Link>
  <header><h1 className="text-3xl font-semibold">配套解析匹配与解法评审</h1><p className="mt-3 text-sm leading-6 text-slate-500">先保存试卷裁切题目，再处理配套解析。原始来源、教师副本和 AI 建议分别保存；匹配与数学正确性分别审核。</p></header>
  {error&&<p role="alert" className="rounded-lg bg-amber-50 p-4">{error}</p>}{busy&&<p role="status">{busy} 每个完成阶段都会保存，重新打开可继续。</p>}
  <section className="surface-card space-y-3 p-5"><label className="block text-sm">上传或替换配套解析（PDF，不超过40MB）<input className={inputClass} type="file" accept="application/pdf,.pdf" disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></label>
   <select aria-label="解析源文件" className={inputClass} value={sourceId} onChange={e=>{setSourceId(e.target.value);setSelected('');}}>{data?.sources.map(s=><option key={s.id} value={s.id}>{s.filename} · {s.status==='ready'?'已切割':s.status==='failed'?'失败，可重试':'待处理'} · 批次 {s.batch_id.slice(0,8)}</option>)}</select>
   <div className="flex flex-wrap gap-3"><Button disabled={!!busy||!sourceId||!data?.questions.length} onClick={()=>void extract()}>切割与匹配／重试</Button><Button variant="outline" disabled={!!busy||!sourceId} onClick={()=>void task('重新匹配未审核候选…',async()=>{await action('rematch',sourceId,null);await reload();})}>重新匹配未审核项</Button><Button variant="outline" disabled={!!busy} onClick={()=>void task('刷新…',async()=>{await reload();})}>刷新进度</Button>{source&&<a href={source.url} target="_blank" rel="noreferrer" className="text-sm underline">查看解析原文件</a>}</div>
   <p className="text-xs leading-6 text-slate-500">本机运行时，扫描版会自动使用本地识别，按题号位置切割并保留跨页原图。识别文字中的公式仍需对照原图核查。替换文件保留旧来源和审核历史；不自动调用整卷深度 AI。</p>
   {data?.sources.find(s=>s.id===sourceId)?.error&&<p role="alert" className="text-sm text-amber-800">{data.sources.find(s=>s.id===sourceId)?.error}</p>}
   {data&&<p className="text-sm">可靠匹配 {data.entries.filter(e=>e.status==='MATCHED').length} · 待审核 {data.entries.filter(e=>e.status==='NEEDS_REVIEW').length} · 未匹配 {data.entries.filter(e=>e.status==='UNMATCHED').length} · 已确认 {data.entries.filter(e=>e.status==='CONFIRMED').length} · 无已确认解析的题目 {data.questions.filter(q=>!data.entries.some(e=>e.question_id===q.id&&e.status==='CONFIRMED')).length}</p>}
   <Button variant="outline" disabled={!!busy||!data?.entries.some(e=>e.status==='MATCHED'&&e.source_id===sourceId)} onClick={()=>void task('批量确认可靠项…',async()=>{for(const e of data!.entries.filter(e=>e.status==='MATCHED'&&e.source_id===sourceId))await confirm(e,e.question_id||'',e.teacher_text??e.data.text);await reload();})}>批量确认当前文件可靠匹配项</Button>
  </section>
  <div className="flex flex-wrap gap-2">{data?.entries.filter(e=>e.source_id===sourceId).map(e=><Button variant={selected===e.id?'default':'outline'} key={e.id} onClick={()=>{setSelected(e.id);setTab('original');}}>第 {e.data.number??'未知'} 题 · {labels[e.status]}</Button>)}</div>
  {entry&&<div className="grid items-start gap-5 lg:grid-cols-2">
   <section className="surface-card min-w-0 space-y-4 p-5"><h2 className="text-xl font-semibold">试卷原题</h2><select aria-label="对应试卷题目" className={inputClass} value={questionId} onChange={e=>setQuestionId(e.target.value)}><option value="">保留未匹配</option>{data?.questions.map(q=><option key={q.id} value={q.id}>第 {q.number} 题 · {q.type||'未分类'}</option>)}</select>
    {q?<><MathText className="whitespace-pre-wrap leading-8">{q.text||'无文字层，请查看试卷原题图。'}</MathText><QuestionImage paperId={paperId} questionId={q.id}/><p className="text-xs">原位置：第 {q.regions.map(r=>r.page).join('、')} 页，{q.regions.length} 个区域</p></>:<p>尚未指定对应题目。没有解析的题目可继续保留。</p>}
   </section>
   <section className="surface-card min-w-0 space-y-4 p-5"><h2 className="text-xl font-semibold">配套解析 · {labels[entry.status]}</h2>
    <p className="text-xs">匹配等级：{entry.proposal.level}（未经概率校准）· 版本 {entry.proposal.version}</p>{entry.proposal.reasons?.map((r,i)=><p key={i} className="text-sm text-amber-800">{r}</p>)}
    <div className="flex flex-wrap gap-2">{[['original','原始解析'],['quality','AI 质量评审'],['methods','优化解法'],['general','通法与易错点']].map(([v,label])=><Button key={v} variant={tab===v?'default':'outline'} size="sm" onClick={()=>setTab(v)}>{label}</Button>)}</div>
    <details open={tab==='original'}><summary className="cursor-pointer font-medium">原始解析（始终可回溯）{entry.data.answerOnly?' · 仅答案，无来源详细过程':''}</summary>
     {preview&&<img alt="原解析区域，跨页时拼接" className="w-full rounded-lg border" src={preview}/>}
     <details className="my-3"><summary className="cursor-pointer text-sm">查看识别文字（公式请以原图为准）</summary><MathText className="my-3 whitespace-pre-wrap leading-8">{entry.data.text}</MathText></details>
     <p className="text-xs leading-6">{source?.filename} · 第 {entry.data.regions.map(r=>r.page).join('、')} 页</p>{source&&<a className="text-sm underline" target="_blank" rel="noreferrer" href={`${source.url}#page=${entry.data.regions[0]?.page}`}>查看原文件对应页与完整图形</a>}
    </details>
    {tab==='original'&&<><label className="block text-sm">教师编辑副本（原始提取内容保留）<textarea className={`${inputClass} min-h-60`} value={teacherText} onChange={e=>setTeacherText(e.target.value)}/></label><div className="flex flex-wrap gap-2"><Button disabled={!!busy||!questionId} onClick={()=>void task('保存匹配确认…',async()=>{await confirm(entry,questionId,teacherText);await reload();})}>确认匹配并保存副本</Button><Button variant="outline" disabled={!!busy} onClick={()=>void task('保存待审核副本…',async()=>{await confirm(entry,questionId,teacherText,false);await reload();})}>保存为待审核</Button><Button variant="outline" disabled={!!busy} onClick={()=>void task('解除关联…',async()=>{await confirm(entry,'',teacherText,false);await reload();})}>解除关联</Button></div></>}
    {tab!=='original'&&<><p className="text-xs leading-6 text-amber-800">AI 结果需教师核查，未做形式化数学验证；当前模型上下文为文字与区域信息，不含图像像素。</p>
     {review&&<p className="text-xs">{review.model} · {review.prompt_version} · {review.status} · 教师状态 {review.teacher_status} · {review.elapsed_ms}ms{review.match_revision!==entry.revision?' · 已过期，请重新评审':''}</p>}
     {review?.error&&<p role="alert">{review.error}</p>}
     {result&&tab==='quality'&&<><h3 className="font-semibold">{labels[result.quality.verdict]}</h3><MathText>{result.quality.summary}</MathText><MathText>{result.quality.originalIdea}</MathText>{result.quality.issues.map((issue,i)=><div key={i} className="rounded-lg bg-amber-50 p-3"><MathText>{`步骤：${issue.excerpt}\n原因：${issue.reason}\n建议：${issue.correction}`}</MathText></div>)}<MathText>{`优点：${result.quality.strengths.join('；')}\n不足：${result.quality.limitations.join('；')}`}</MathText></>}
     {result?.methods&&tab==='methods'&&<><h3>{labels[result.methods.recommendation]}</h3><MathText>{result.methods.reason}</MathText>{!result.methods.alternatives.length&&<p>未提出优化解法，保留原方法或等待核查。</p>}{result.methods.alternatives.map((m,i)=><MathText key={i} className="whitespace-pre-wrap leading-8">{`${m.idea}\n${m.steps.join('\n')}\n适用条件：${m.conditions}\n比较：${m.comparison}`}</MathText>)}</>}
     {result?.methods&&tab==='general'&&(result.methods.method?<MathText className="whitespace-pre-wrap leading-8">{`题型：${result.methods.method.model}\n典型特征：${result.methods.method.features.join('；')}\n通用流程：${result.methods.method.steps.join('\n')}\n适用条件：${result.methods.method.conditions.join('；')}\n易错点：${result.methods.method.mistakes.join('；')}\n变式方向：${result.methods.method.variants.join('；')}`}</MathText>:<p>本题暂未提炼可迁移通法。</p>)}
     {!result&&<p>尚无此题评审；请先确认匹配，再按需生成。</p>}
     <div className="flex flex-wrap gap-2"><Button disabled={!!busy||entry.status!=='CONFIRMED'} onClick={()=>void generate('basic')}>基础数学核查／继续</Button><Button variant="outline" disabled={!!busy||entry.status!=='CONFIRMED'} onClick={()=>void generate('deep')}>深度评审与通法／继续</Button></div>
     {review?.status==='completed'&&review.teacher_status==='pending'&&review.match_revision===entry.revision&&result&&<><details><summary>编辑 AI 建议（保存教师副本，保留 AI 原文）</summary><AIReviewEditor value={editAI||result} onChange={setEditAI} disabled={!!busy}/></details><div className="flex gap-3">{[['accepted','接受／保存教师副本'],['rejected','拒绝建议']].map(([decision,label])=><Button key={decision} disabled={!!busy} variant="outline" onClick={()=>void task('保存教师决定…',async()=>{await action('decision',review.id,{decision,...(editAI&&decision==='accepted'?{result:editAI}:{})});await reload();})}>{label}</Button>)}</div></>}
    </>}
    <Button variant="outline" disabled={!!busy} onClick={()=>void task('读取审核历史…',async()=>{setHistory(JSON.stringify(await action('history',entry.id,null),null,2));})}>查看匹配修改历史</Button>{history&&<pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{history}</pre>}
    <details><summary>全部 AI 评审历史（{reviews.length}）</summary>{reviews.map(r=><details key={r.id}><summary>{r.created_at} · {r.teacher_status} · 匹配 v{r.match_revision} · {r.status}</summary><MathText className="whitespace-pre-wrap">{JSON.stringify(r.result,null,2)}</MathText></details>)}</details>
   </section>
  </div>}
  {sourceId&&<details className="surface-card p-5"><summary>手动补充缺失解析或扫描文件内容</summary><div className="mt-4 space-y-3"><input aria-label="手动解析题号" placeholder="题号（可留空）" className={inputClass} value={manualNumber} onChange={e=>setManualNumber(e.target.value)}/><input aria-label="原解析页码" type="number" min={1} max={80} className={inputClass} value={manualPage} onChange={e=>setManualPage(Number(e.target.value))}/><textarea aria-label="手动解析内容" placeholder="对照原文件填写；以教师手动补充标注，不伪装来源自动解析" className={`${inputClass} min-h-40`} value={manualText} onChange={e=>setManualText(e.target.value)}/><Button disabled={!!busy||!manualText.trim()} onClick={()=>void task('保存手动候选…',async()=>{await action('manual',sourceId,{operationId:crypto.randomUUID(),entry:{key:'manual',number:manualNumber?Number(manualNumber):null,section:'',text:manualText,regions:[{page:manualPage,x:0,y:0,width:1,height:1}],answerOnly:false,warnings:[]}});await reload();setManualText('');})}>保存候选，再指定题目确认</Button></div></details>}
 </div>;
}
function AIReviewEditor({value,onChange,disabled}:{value:SolutionReview;onChange:(v:SolutionReview)=>void;disabled:boolean}){
 const field=(label:string,text:string,update:(s:string)=>void)=><label className="block space-y-1 text-sm" key={label}><span>{label}</span><textarea disabled={disabled} className={`${inputClass} min-h-24`} value={text} onChange={e=>update(e.target.value)}/></label>;
 return <div className="mt-3 space-y-3">
  <label className="block text-sm">核查结论<select disabled={disabled} className={inputClass} value={value.quality.verdict} onChange={e=>onChange({...value,quality:{...value.quality,verdict:e.target.value as SolutionReview['quality']['verdict']}})}>{['no_obvious_error','suspicious','error_detected','insufficient'].map(v=><option key={v} value={v}>{labels[v]}</option>)}</select></label>
  {field('原解析评价',value.quality.summary,s=>onChange({...value,quality:{...value.quality,summary:s}}))}
  {value.methods&&<>{field('解法比较与最终建议',value.methods.reason,s=>onChange({...value,methods:{...value.methods!,reason:s}}))}
   {value.methods.alternatives.map((m,i)=>field(`另一种解法 ${i+1} 的完整步骤（每行一步）`,m.steps.join('\n'),s=>onChange({...value,methods:{...value.methods!,alternatives:value.methods!.alternatives.map((a,j)=>j===i?{...a,steps:s.split('\n').filter(Boolean)}:a)}})))}
   {value.methods.method&&(['steps','conditions','mistakes','variants'] as const).map(key=>field(({steps:'通用解题流程',conditions:'适用条件',mistakes:'常见错误',variants:'变式方向'})[key]+'（每行一项）',value.methods!.method![key].join('\n'),s=>onChange({...value,methods:{...value.methods!,method:{...value.methods!.method!,[key]:s.split('\n').filter(Boolean)}}})))}</>}
 </div>;
}
function QuestionImage({paperId,questionId}:{paperId:string;questionId:string}){
 const [image,setImage]=useState<{id:string;url:string}|null>(null);useEffect(()=>{let disposed=false;void api<{questions:{id:string;imageUrl:string}[]}>(`/api/papers/${paperId}`).then(d=>{if(!disposed)setImage({id:questionId,url:d.questions.find(q=>q.id===questionId)?.imageUrl||''});}).catch(()=>{});return()=>{disposed=true;};},[paperId,questionId]);
 return image?.id===questionId&&image.url?<img alt="试卷原题区域" src={image.url} className="w-full rounded-lg border"/>:null;
}

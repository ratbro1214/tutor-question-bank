"use client";
import { EnglishSourceCrops } from './english-source-crops';
import { StemHints } from './english-stem-vocabulary';
import {useEffect,useState} from 'react';
type Paper={id:string;year:number;volume:string;title:string;passage_count:number;question_count:number};
type Passage={original_crops?:string|null;id:string;label:string;text:string;figures:string|null};
type Question={id:string;passage_id:string;number:number;stem:string;type:string;answer:string;answer_status:string};
type Option={question_id:string;label:string;text:string};
type Evidence={question_id:string;source_url:string;source_name:string;public_path:string|null};
type Detail={paper:Paper;passages:Passage[];questions:Question[];options:Option[];evidence:Evidence[]};
function PassageBody({passage}:{passage:Passage}){
 const figures:{path:string;caption:string;after?:string}[]=passage.figures?JSON.parse(passage.figures):[];
 const f=figures[0],position=f?.after?passage.text.indexOf(f.after)+f.after.length:0;
 return <div className="whitespace-pre-wrap font-serif text-[17px] leading-[1.95] text-slate-800">{f&&position>0?passage.text.slice(0,position):null}{figures.map(f=><figure key={f.path} className="my-5"><a href={f.path} target="_blank" rel="noreferrer"><img src={f.path} alt={f.caption} className="h-auto w-full rounded-lg border bg-white"/></a><figcaption className="mt-2 font-sans text-xs text-slate-500">{f.caption} · 点击放大</figcaption></figure>)}{passage.text.slice(f&&position>0?position:0)}</div>;
}
export function EnglishReadingPractice({onComplete}:{onComplete:()=>void}){
 const [papers,setPapers]=useState<Paper[]>([]),[paperId,setPaperId]=useState(''),[detail,setDetail]=useState<Detail|null>(null),[label,setLabel]=useState('A');
 const [selected,setSelected]=useState<Record<string,string>>({}),[checked,setChecked]=useState<Record<string,boolean>>({}),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();fetch('/api/english/reading',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('真题目录加载失败');return r.json() as Promise<{papers:Paper[]}>;}).then(d=>{setPapers(d.papers);setPaperId(d.papers[0]?.id??'');}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
 useEffect(()=>{if(!paperId)return;const controller=new AbortController();setDetail(null);setError('');fetch(`/api/english/reading/${paperId}`,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('试题加载失败');return r.json() as Promise<Detail>;}).then(setDetail).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[paperId]);
 const passage=detail?.passages.find(p=>p.label===label),questions=detail?.questions.filter(q=>q.passage_id===passage?.id)??[];
 const answered=questions.filter(q=>selected[q.id]).length,reviewed=questions.every(q=>checked[q.id]);
 return <div className="mt-6 space-y-5">
  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f5f7f4] p-4">
   <label className="text-sm font-medium">年份与卷别 <select aria-label="年份与卷别" value={paperId} onChange={e=>{setPaperId(e.target.value);setLabel('A');}} className="ml-2 rounded-lg border bg-white px-3 py-2">{papers.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
   <span className="text-xs text-slate-500">{papers.length} 套试卷 · {papers.reduce((n,p)=>n+p.question_count,0)} 道阅读题</span>
  </div>
  <div className="flex flex-wrap gap-2" role="tablist" aria-label="阅读篇目">{['A','B','C','D','七选五'].map(l=><button key={l} role="tab" aria-selected={l===label} onClick={()=>setLabel(l)} className={`rounded-lg px-4 py-2 text-sm ${l===label?'bg-[#193a35] text-white':'bg-slate-100 text-slate-600'}`}>{l==='七选五'?l:`阅读 ${l}`}</button>)}</div>
  <p className="text-xs leading-5 text-slate-500">答案按来源题号对应，未做正确性复核。选择选项后可对照来源答案；保留题卷中的编号。</p>
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {!detail&&!error&&<p className="text-sm text-slate-500">{paperId?'正在加载试题…':'正在加载真题目录…'}</p>}
  {detail&&passage&&<>
   <article className="rounded-2xl border border-[#e5e9e2] bg-[#fafbf8] p-5 sm:p-7"><h4 className="mb-4 text-sm font-semibold text-[#193a35]">{detail.paper.title} · {label==='七选五'?label:`阅读 ${label}`}</h4><PassageBody passage={passage}/></article>
   <EnglishSourceCrops payload={passage.original_crops} />
   <div className="space-y-5">{questions.map(q=><fieldset key={q.id} className="rounded-xl border border-slate-200 p-4 sm:p-5"><legend className="max-w-full px-2 text-sm font-semibold leading-6">{q.number}. {q.stem}</legend><StemHints stem={q.stem} /><div className="grid gap-2">{detail.options.filter(o=>o.question_id===q.id).map(o=><label key={o.label} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-6 ${selected[q.id]===o.label?'border-[#193a35] bg-[#eef3ee]':'border-slate-200 hover:bg-slate-50'}`}><input type="radio" name={q.id} value={o.label} checked={selected[q.id]===o.label} onChange={()=>{setSelected(s=>({...s,[q.id]:o.label}));setChecked(s=>({...s,[q.id]:false}));}} className="mt-1.5 accent-[#193a35]"/><span><b className="mr-2">{o.label}.</b>{o.text}</span></label>)}</div><button disabled={!selected[q.id]} onClick={()=>setChecked(s=>({...s,[q.id]:true}))} className="mt-3 rounded-lg bg-[#193a35] px-4 py-2 text-xs text-white disabled:opacity-40">对照答案</button>{checked[q.id]&&<div className="mt-3 rounded-lg bg-[#f5f3ee] p-3 text-sm" aria-live="polite">来源答案：<b>{q.answer}</b> · 你的选择：{selected[q.id]} · {selected[q.id]===q.answer?'与来源答案一致':'与来源答案不同'}{detail.evidence.filter(e=>e.question_id===q.id).slice(0,1).map(e=><a key={e.source_url} href={e.public_path??e.source_url} target="_blank" rel="noreferrer" className="ml-3 text-xs underline">查看答案原件</a>)}</div>}</fieldset>)}</div>
   <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>已作答 {answered}/{questions.length} 题</span><div className="flex gap-3"><button onClick={()=>{setSelected(s=>{const n={...s};questions.forEach(q=>delete n[q.id]);return n;});setChecked(s=>{const n={...s};questions.forEach(q=>delete n[q.id]);return n;});}} className="rounded-lg border px-3 py-2">重新练习本篇</button><button disabled={answered!==questions.length} onClick={()=>{setChecked(s=>({...s,...Object.fromEntries(questions.map(q=>[q.id,true]))}));onComplete();}} className="rounded-lg bg-[#193a35] px-3 py-2 text-white disabled:opacity-40">{reviewed?'已对照本篇答案':'对照本篇全部答案'}</button></div></div>
  </>}
 </div>;
}

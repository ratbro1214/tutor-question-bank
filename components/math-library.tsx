"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MathText } from '@/components/math-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { chaptersForStage, taxonomyForStage } from '@/lib/taxonomy';
import type { Classification, EducationStage } from '@/lib/classification';
import type { ExplanationContent } from '@/lib/question-explanation';
import type { CropRegion } from '@/lib/paper';
type Point={code:string;name:string};
type Item={id:string;text:string;stage:string|null;status:string;identity_status:string;classification:Classification|null;imageUrl:string|null;sources:{id:string;title:string;paperId:string|null}[]};
type Facets={stats:{total:number;classified:number;unclassified:number;papers:number};stages:string[];chapters:Point[];knowledge:Point[];types:string[];difficulties:string[];papers:{id:string;title:string}[]};
type Results={items:Item[];total:number;page:number;pageSize:number};
type Source={id:string;title:string;math_paper_id:string|null;source_type:string;question_number:string|null;page:number|null;imageUrl:string|null;locator:{regions?:CropRegion[]};explanation:ExplanationContent|null;content_revision_id:string;business_content_matches:number|null};
type Detail=Omit<Item,'sources'>&{current_revision_id:string;sources:Source[]};
const emptyFilters={q:'',stage:'',chapter:'',knowledge:'',type:'',difficulty:'',paper:'',classification:''};
const selectClass='h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';
async function read<T>(url:string,signal:AbortSignal):Promise<T>{const response=await fetch(url,{signal,cache:'no-store'}),data=await response.json() as T&{error?:string};if(!response.ok)throw Error(data.error||'题库读取失败。');return data;}
function LibraryImage({url,thumbnail=false,label='原始题图'}:{url:string|null;thumbnail?:boolean;label?:string}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[url]);
 return !url||failed?<p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{failed?'题图加载失败或文件缺失。':'没有可用的题图。'}</p>:<img loading="lazy" src={url} alt={label} onError={()=>setFailed(true)} className={thumbnail?'h-36 w-full rounded-lg border border-[var(--border)] bg-white object-contain object-top':'h-auto w-full rounded-xl border border-[var(--border)] bg-white'} />;
}
function ClassificationLabels({item}:{item:Item}){const c=item.classification;return <div className="flex flex-wrap gap-2"><Badge variant="secondary">{item.stage||'学段未标注'}</Badge><Badge variant="secondary">{c?.chapter?.name||'章节未分类'}</Badge><Badge variant="secondary">{c?.question_type||'题型未分类'}</Badge><Badge variant="secondary">{c?.difficulty||'难度未分类'}</Badge>{c?.knowledge_points?.length?c.knowledge_points.map(k=><Badge key={k.code} variant="outline">{k.name}</Badge>):<Badge variant="outline">未分类</Badge>}</div>;}
export function MathLibrary(){
 const [input,setInput]=useState(''),[state,setState]=useState({filters:emptyFilters,page:1}),[facets,setFacets]=useState<Facets|null>(null),[results,setResults]=useState<Results|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const timer=setTimeout(()=>setState(old=>old.filters.q===input.trim()?old:{filters:{...old.filters,q:input.trim()},page:1}),350);return()=>clearTimeout(timer);},[input]);
 useEffect(()=>{const controller=new AbortController();read<Facets>('/api/math-library/facets',controller.signal).then(setFacets).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[retry]);
 const query=useMemo(()=>new URLSearchParams({...state.filters,page:String(state.page)}).toString(),[state]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setResults(null);read<Results>('/api/math-library?'+query,controller.signal).then(setResults).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[query,retry]);
 const f=state.filters;
 function change(key:keyof typeof emptyFilters,value:string){setState(old=>({page:1,filters:{...old.filters,[key]:value,...(key==='stage'?{chapter:'',knowledge:''}:key==='chapter'?{knowledge:''}:{})}}));}
 const stages=(facets?.stages||[]).filter(s=>s==='高中'||s==='初中') as EducationStage[];
 const selectedStages=f.stage?[f.stage as EducationStage]:stages;
 const allowedChapters=new Set<string>(selectedStages.flatMap(s=>chaptersForStage(s).map(([code])=>code)));
 const allowedKnowledge=new Set<string>(selectedStages.flatMap(s=>taxonomyForStage(s).filter(([, ,owner])=>owner!=='METHOD'&&(!f.chapter||owner===f.chapter)).map(([code])=>code)));
 const filter=(label:string,key:keyof typeof emptyFilters,options:{value:string;label:string}[])=><label className="space-y-2 text-xs text-slate-500">{label}<select aria-label={label} className={selectClass} value={f[key]} onChange={e=>change(key,e.target.value)}><option value="">全部</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
 return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">统一数学题库</h1><p className="mt-2 text-sm text-slate-500">跨试卷与来源检索已建立 Canonical 身份的数学题。同一身份仅显示一次。</p></div>
 <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[['题目总数',facets?.stats.total],['来源试卷',facets?.stats.papers],['有知识点分类',facets?.stats.classified],['尚未分类',facets?.stats.unclassified]].map(([label,value])=><div className="rounded-2xl border border-[var(--border)] bg-white p-5" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold">{value??'—'}</p></div>)}</div>
 <section aria-label="搜索与筛选" className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5"><Input aria-label="搜索题干、关键词、知识点" placeholder="搜索题干、关键词、知识点……" value={input} onChange={e=>setInput(e.target.value)} /><p className="text-xs text-slate-500">多个关键词用空格分隔，同时匹配；筛选条件同时生效。</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
 {filter('学段','stage',stages.map(s=>({value:s,label:s})))}
 {filter('章节','chapter',(facets?.chapters||[]).filter(c=>allowedChapters.has(c.code)).map(c=>({value:c.code,label:c.name})))}
 {filter('知识点','knowledge',(facets?.knowledge||[]).filter(k=>allowedKnowledge.has(k.code)).map(k=>({value:k.code,label:k.name})))}
 {filter('题型','type',(facets?.types||[]).map(s=>({value:s,label:s})))}
 {filter('难度','difficulty',(facets?.difficulties||[]).map(s=>({value:s,label:s})))}
 {filter('来源试卷','paper',(facets?.papers||[]).map(p=>({value:p.id,label:p.title})))}
 {filter('分类状态','classification',[{value:'classified',label:'已有知识点'},{value:'unclassified',label:'未分类'}])}
 <Button variant="outline" className="mt-6" onClick={()=>{setInput('');setState({filters:emptyFilters,page:1});}}>清空筛选</Button></div></section>
 {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}<Button variant="outline" className="ml-4" onClick={()=>setRetry(n=>n+1)}>重试</Button></div>}
 <p aria-live="polite" className="text-sm text-slate-500">{loading?'正在查询题库…':results?`找到 ${results.total} 道题 · 每页 ${results.pageSize} 道`:''}</p>
 {!loading&&results?.total===0&&<div className="rounded-2xl border border-[var(--border)] bg-white p-10 text-center text-slate-500">没有符合条件的 Canonical 数学题。请调整关键词或筛选条件。</div>}
 <div className="grid gap-4 xl:grid-cols-2">{results?.items.map(item=><article key={item.id} className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5"><Link href={'/math-library/'+item.id} aria-label={'查看题目 '+item.id}><LibraryImage url={item.imageUrl} thumbnail /></Link><div className="line-clamp-3 text-sm leading-7"><MathText>{item.text||'当前版本没有文字题干，请查看原始题图。'}</MathText></div><ClassificationLabels item={item}/><p className="text-xs leading-5 text-slate-500">来源：{item.sources.map(s=>s.title).join('；')||'来源未记录'}</p><div className="flex items-center justify-between gap-3"><p className="break-all text-xs leading-5 text-slate-400">Canonical：{item.status==='active'?'有效':'待确认'} · {item.id}</p><Link className="shrink-0 text-sm font-medium text-terracotta-800" href={'/math-library/'+item.id}>查看详情 →</Link></div></article>)}</div>
 {results&&results.total>0&&<nav aria-label="分页" className="flex items-center justify-center gap-4"><Button variant="outline" disabled={loading||state.page<=1} onClick={()=>setState(old=>({...old,page:old.page-1}))}>上一页</Button><span className="text-sm">第 {state.page} / {Math.ceil(results.total/results.pageSize)} 页</span><Button variant="outline" disabled={loading||state.page*results.pageSize>=results.total} onClick={()=>setState(old=>({...old,page:old.page+1}))}>下一页</Button></nav>}
 </div>;
}
function SavedExplanation({content}:{content:ExplanationContent}){return <div className="space-y-4">{[['答案',content.answer],['思路',content.approach],...content.steps.map(s=>[s.title,s.content]),['教学提示',content.teachingNotes],['易错点',content.commonMistakes],['验证',content.verification],['其他方法',content.alternativeMethod],['待补充信息',content.missingInformation]].filter(([,v])=>v).map(([title,value],i)=><section key={i}><h3 className="mb-2 text-sm font-semibold">{title}</h3><MathText className="text-sm leading-7">{value}</MathText></section>)}</div>;}
export function MathLibraryDetail({id}:{id:string}){
 const [item,setItem]=useState<Detail|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setItem(null);setError('');read<Detail>('/api/math-library/'+encodeURIComponent(id),controller.signal).then(setItem).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[id,retry]);
 return <div className="space-y-6"><Link href="/math-library" className="text-sm text-terracotta-800">← 返回统一数学题库</Link><h1 className="text-2xl font-semibold">题目详情</h1>{error?<div role="alert" className="rounded-xl bg-red-50 p-5">{error}<Button variant="outline" className="ml-4" onClick={()=>setRetry(n=>n+1)}>重试</Button></div>:!item?<p role="status">正在读取题目…</p>:<>
 <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-6"><p className="break-all text-xs text-slate-500">Canonical Question ID：{item.id}<br/>当前版本：{item.current_revision_id} · 状态：{item.status} · 内容身份：{item.identity_status}</p><ClassificationLabels item={{...item,sources:[]}}/><h2 className="text-lg font-semibold">完整题干</h2><MathText className="text-sm leading-8">{item.text||'当前版本未保存文字题干，请查看原始题图。'}</MathText><p className="text-sm text-slate-500">解题方法：{item.classification?.methods?.map(m=>m.name).join('、')||'未标注'}</p></section>
 <h2 className="text-xl font-semibold">题图、解析与来源（{item.sources.length} 次出现）</h2>{!item.sources.length&&<p>此题尚未记录可访问的来源；题图与解析未生成。</p>}
 {item.sources.map(source=><section key={source.id} className="space-y-5 rounded-2xl border border-[var(--border)] bg-white p-6"><div><h3 className="font-semibold">{source.title}</h3><p className="mt-2 text-sm text-slate-500">原题号：{source.question_number||'未记录'} · 页码：{source.locator.regions?.map(r=>r.page).filter((v,i,a)=>a.indexOf(v)===i).join('、')||source.page||'未记录'} · 来源：{source.source_type==='math_paper'?'数学套卷':source.source_type}</p>{source.math_paper_id&&<Link href={'/papers/'+source.math_paper_id} className="mt-2 inline-block text-sm text-terracotta-800">打开来源试卷 →</Link>}</div>
 {source.content_revision_id!==item.current_revision_id&&<p className="rounded-lg bg-amber-50 p-3 text-sm">该来源对应历史内容版本；当前题干以上方 Canonical 版本为准。</p>}
 {source.business_content_matches===0&&<p className="rounded-lg bg-amber-50 p-3 text-sm">来源业务题的文字已变更，解析未作为当前版本解析展示。原题图可能也已更新，请核对来源试卷。</p>}
 <LibraryImage url={source.imageUrl} label={source.title+'第'+source.question_number+'题原图'}/>
 {source.locator.regions?.length?<div className="text-xs text-slate-500"><p>原题图沿用已有拼接顺序，共 {source.locator.regions.length} 个裁切片段：</p><ol className="mt-2 list-inside list-decimal space-y-1">{source.locator.regions.map((r,i)=><li key={i}>第 {r.page} 页 · x={r.x.toFixed(3)}, y={r.y.toFixed(3)}, 宽={r.width.toFixed(3)}, 高={r.height.toFixed(3)}</li>)}</ol></div>:<p className="text-xs text-slate-500">裁切位置未记录。</p>}
 <h3 className="text-lg font-semibold">已有解析</h3>{source.explanation?<SavedExplanation content={source.explanation}/>:<p className="text-sm text-slate-500">解析未生成，或当前内容版本没有可复用的解析。</p>}</section>)}
 </>}</div>;
}

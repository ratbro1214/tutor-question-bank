"use client";
import { useEffect, useState } from 'react';
import type { VocabularyResult } from '@/lib/english-study';

const tags:Record<string,string>={gk:'高考',zk:'中考',cet4:'四级',cet6:'六级'};
const formLabels:Record<string,string>={p:'过去式',d:'过去分词',i:'现在分词',s:'复数',r:'比较级',t:'最高级','3':'第三人称单数','0':'原形'};
const storageKey='english-ecdict-review-v1';
type Review=Record<string,'known'|'again'>;
export function EnglishVocabulary({onComplete}:{onComplete:()=>void}) {
  const [query,setQuery]=useState(''); const [search,setSearch]=useState('');
  const [tag,setTag]=useState('gk'); const [context,setContext]=useState(false); const [page,setPage]=useState(1);
  const [data,setData]=useState<VocabularyResult|null>(null); const [error,setError]=useState('');
  const [loading,setLoading]=useState(true); const [revealed,setRevealed]=useState<string[]>([]);
  const [review,setReview]=useState<Review>({}); const [ready,setReady]=useState(false); const [storageError,setStorageError]=useState(false);
  const [reviewed,setReviewed]=useState<string[]>([]);
  const [reviewMode,setReviewMode]=useState('all');
  const reviewWords=reviewMode==='all'?'':JSON.stringify(Object.keys(review).filter(word=>review[word]===reviewMode));
  useEffect(()=>{let active=true;Promise.resolve().then(()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved)){const valid=Object.fromEntries(Object.entries(saved).filter(([key,v])=>key.length<100&&(v==='known'||v==='again'))) as Review;if(active)setReview(valid);}}catch{if(active)setStorageError(true);}if(active)setReady(true);});return()=>{active=false;};},[]);
  useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>{if(!controller.signal.aborted){setLoading(true);setError('');}});const params=new URLSearchParams({q:search,tag,page:String(page),context:context?'1':'0'});fetch(`/api/english/vocabulary?${params}`,{signal:controller.signal,...(reviewWords?{method:'POST',headers:{'Content-Type':'application/json'},body:`{"words":${reviewWords}}`}:{})}).then(r=>{if(!r.ok)throw Error('词库读取失败');return r.json();}).then(result=>{if(controller.signal.aborted)return;setData(result as VocabularyResult);setRevealed([]);setLoading(false);}).catch(e=>{if(e.name!=='AbortError'){setError('词库读取失败，请更换筛选条件后重试。');setLoading(false);}});return()=>controller.abort();},[search,tag,page,context,reviewWords]);
  function mark(word:string,state:'known'|'again'){
    const next={...review,[word]:state};setReview(next);
    try{localStorage.setItem(storageKey,JSON.stringify(next));setStorageError(false);}catch{setStorageError(true);}
    const done=reviewed.includes(word)?reviewed:[...reviewed,word];setReviewed(done);if(done.length>=4)onComplete();
  }
  return <div className="space-y-5">
    <div className="rounded-xl bg-[#f1f5ef] p-4 text-xs leading-6 text-slate-600">
      <b className="text-[#315d4c]">ECDICT · 开源英汉词库</b><p>{data?`${data.stats.total.toLocaleString()} 个考试与真题词条 · ${data.stats.withExamples.toLocaleString()} 个已关联真题例句`:'正在读取离线词库…'}</p>
      <p>已认识 {Object.values(review).filter(v=>v==='known').length} · 待复习 {Object.values(review).filter(v=>v==='again').length} · 本次复习 {reviewed.length} / 4</p>
      <p className="text-slate-400">{storageError?'浏览器存储不可用，本次记录仅在当前页面有效。':'学习记录保存在当前浏览器。'} 释义为词库释义，具体词义需结合原句判断。</p>
    </div>
    <form className="flex gap-2" onSubmit={e=>{e.preventDefault();setSearch(query.trim());setPage(1);}}><input aria-label="搜索词库" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索英文、中文或词形，如 went" maxLength={80} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"/><button className="rounded-xl bg-[#193a35] px-4 text-sm text-white">搜索</button></form>
    <div className="flex flex-wrap items-center gap-2"><label className="text-xs">考试标签 <select aria-label="考试标签" value={tag} onChange={e=>{setTag(e.target.value);setPage(1);}} className="ml-1 rounded-lg border p-2"><option value="">全部词汇</option>{Object.entries(tags).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label><label className="inline-flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={context} onChange={e=>{setContext(e.target.checked);setPage(1);}}/>只看有真题例句的词</label></div>
    <div role="group" aria-label="复习筛选" className="flex gap-2">{[{value:'all',label:'全部词条'},{value:'again',label:'待复习'},{value:'known',label:'已认识'}].map(mode=><button key={mode.value} disabled={!ready} aria-pressed={reviewMode===mode.value} onClick={()=>{setReviewMode(mode.value);setPage(1);}} className={`rounded-lg border px-3 py-2 text-xs ${reviewMode===mode.value?'bg-[#193a35] text-white':'text-slate-500'}`}>{mode.label}</button>)}</div>
    <p role="status" className="text-xs text-slate-500">{loading?'正在查询…':error||`找到 ${data?.total.toLocaleString()||0} 个词条`}</p>
    {!loading&&!error&&data?.entries.map(entry=>{const show=revealed.includes(entry.word);return <article key={entry.word} className="rounded-2xl border border-[#e5e8df] p-5">
      <div className="flex flex-wrap justify-between gap-2"><div><h4 className="font-serif text-2xl text-[#243c31]">{entry.word}</h4><p className="mt-1 text-xs text-slate-500">{entry.phonetic?`/${entry.phonetic}/`:'词库暂无音标'}</p></div><div className="flex flex-wrap gap-1 self-start">{entry.tags.map(t=><span key={t} className="rounded-full bg-[#f1f5ef] px-2 py-1 text-[10px] text-[#45644f]">{tags[t]}</span>)}{!entry.tags.length&&<span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] text-slate-500">真题补充词</span>}{review[entry.word]&&<span className="px-2 py-1 text-[10px] text-terracotta-700">{review[entry.word]==='known'?'已认识':'待复习'}</span>}</div></div>
      <button aria-expanded={show} onClick={()=>setRevealed(values=>show?values.filter(v=>v!==entry.word):[...values,entry.word])} className="mt-4 rounded-lg border px-3 py-2 text-xs text-slate-600">{show?'收起释义':'查看释义与例句'}</button>
      {show&&<div className="mt-4 space-y-3"><p className="whitespace-pre-line text-sm leading-6">{entry.translation}</p><div className="flex flex-wrap gap-2">{entry.exchange.split('/').map(item=>{const [k,v]=item.split(':');return formLabels[k]&&v?<span key={k} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">{formLabels[k]}：{v}</span>:null;})}</div>
        {entry.examples.length?entry.examples.map(ex=><blockquote key={ex.text} className="border-l-2 border-[#c6d4c8] pl-3"><p className="font-serif text-sm leading-7">{ex.text}</p><p className="text-[10px] text-slate-400">{ex.year} 新高考 {ex.volume==='I'?'Ⅰ':'Ⅱ'} 卷 · 阅读 {ex.label} · <a href={ex.sourcePage} target="_blank" rel="noreferrer" className="underline">{ex.sourceName} · 来源页</a></p></blockquote>):<p className="text-xs text-slate-400">当前 2020–2025 阅读语料中暂无匹配例句。</p>}
        <div className="flex gap-2"><button disabled={!ready} onClick={()=>mark(entry.word,'again')} className="rounded-lg border px-3 py-2 text-xs">再复习</button><button disabled={!ready} onClick={()=>mark(entry.word,'known')} className="rounded-lg bg-[#315d4c] px-3 py-2 text-xs text-white">我认识了</button></div>
      </div>}
    </article>;})}
    {!loading&&data&&!error&&<div className="flex items-center justify-between gap-2 text-xs"><button disabled={data.page<=1} onClick={()=>setPage(data.page-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">上一页</button><span>{data.page} / {data.pages}</span><button disabled={data.page>=data.pages} onClick={()=>setPage(data.page+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">下一页</button></div>}
    {data&&<p className="text-[10px] leading-5 text-slate-400"><a href={data.source.repository} target="_blank" rel="noreferrer" className="underline">ECDICT</a> · MIT · 版本 {data.source.revision.slice(0,7)} · 考试标签沿用上游词库，词条数量不代表官方考纲词数。</p>}
  </div>;
}

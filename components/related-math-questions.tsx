"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { seniorChapters } from '@/lib/senior-taxonomy';
type RelatedResult={total:number;items:{id:string;sources:{title:string}[]}[]};
const chapterCode=(name:string)=>seniorChapters.find(([,label])=>label===name)?.[0]||seniorChapters.find(([,label])=>name.replace(/及其应用|概念与性质|概念|平面/g,'').length>=2&&label.includes(name.replace(/及其应用|概念与性质|概念|平面/g,'')))?.[0];
export function RelatedMathQuestions({chapter,stage}:{chapter:string;stage:string}){
 const code=stage==='高中'?chapterCode(chapter):undefined;
 const [data,setData]=useState<{total:number;items:{id:string;sources:{title:string}[]}[]}|null>(null);
 useEffect(()=>{setData(null);if(!code)return;const c=new AbortController();fetch('/api/math-library?chapter='+encodeURIComponent(code)+'&pageSize=5',{signal:c.signal}).then(async r=>r.ok?await r.json() as RelatedResult:null).then(setData).catch(()=>{});return()=>c.abort();},[code]);
 if(!code||!data)return null;
 return <section className="space-y-2 rounded-xl border border-blue-100 bg-blue-50 p-3"><h3 className="font-semibold">同章节题库题目（{data.total}）</h3><p className="text-xs leading-5 text-slate-500">按章节初步分类展示，可结合原卷练习。具体方法是否适用，需要逐题核查。</p>{data.items.map(q=><Link key={q.id} className="block text-sm text-blue-800 underline" href={'/math-library/'+q.id}>{q.sources.map(s=>s.title).join('；')||'题库题目'}</Link>)}<Link className="block text-sm text-blue-800" href={'/math-library?chapter='+code}>查看本章全部题目 →</Link><Link className="block text-xs text-blue-800" href="/gaokao">浏览十年高考真题 →</Link></section>;
}

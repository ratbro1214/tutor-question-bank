"use client";
import { useEffect, useState } from 'react';
import type { WritingPaper, WritingSummary, WritingType } from '@/lib/english-writing';

export function EnglishWriting() {
  const [papers, setPapers] = useState<WritingSummary[]>([]);
  const [paperId, setPaperId] = useState('');
  const [paper, setPaper] = useState<WritingPaper | null>(null);
  const [type, setType] = useState<WritingType>('APPLICATION');
  const [view, setView] = useState<'text' | 'original'>('text');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/english/writing', { signal: controller.signal }).then(r => {
      if (!r.ok) throw Error('作文目录加载失败');
      return r.json() as Promise<{papers: WritingSummary[]}>;
    }).then(d => { setPapers(d.papers); setPaperId(d.papers[0]?.paperId ?? ''); }).catch(e => { if(e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!paperId) return;
    const controller = new AbortController();
    fetch(`/api/english/writing/${paperId}`, { signal: controller.signal }).then(r => {
      if (!r.ok) throw Error('作文题目加载失败');
      return r.json() as Promise<WritingPaper>;
    }).then(setPaper).catch(e => { if(e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [paperId]);
  const task = paper?.tasks.find(t => t.type === type);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f5f7f4] p-4">
      <label className="text-sm font-medium">年份与卷别 <select aria-label="作文年份与卷别" value={paperId} onChange={e => { setPaperId(e.target.value); setPaper(null); setError(''); }} className="ml-2 rounded-lg border bg-white px-3 py-2">{papers.map(p => <option key={p.paperId} value={p.paperId}>{p.title}</option>)}</select></label>
      <span className="text-xs text-slate-500">{papers.length} 套试卷 · {papers.reduce((n,p) => n+p.tasks.length,0)} 道写作题</span>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="作文题型" className="flex gap-2">{([{type:'APPLICATION',label:'应用文写作'},{type:'CONTINUATION',label:'读后续写'}] as const).map(t => <button key={t.type} role="tab" aria-selected={type === t.type} onClick={() => setType(t.type)} className={`rounded-lg px-4 py-2 text-sm ${type === t.type ? 'bg-[#193a35] text-white' : 'bg-slate-100 text-slate-600'}`}>{t.label}</button>)}</div>
      <div className="flex gap-2">{([{type:'text',label:'阅读题目'},{type:'original',label:'查看原卷'}] as const).map(v => <button key={v.type} aria-pressed={view === v.type} onClick={() => setView(v.type)} className={`rounded-lg border px-3 py-2 text-xs ${view === v.type ? 'border-[#66836f] bg-[#eef3ee]' : 'border-slate-200'}`}>{v.label}</button>)}</div>
    </div>
    <p className="text-xs leading-6 text-slate-500">按原卷整理题目、字数要求与给定开头语。文字仍待逐字校对，可切换原卷核对。相同年份的Ⅰ、Ⅱ卷可能使用相同写作题，分别保留出处。</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!paper && !error && <p role="status" className="text-sm text-slate-500">正在加载作文真题…</p>}
    {paper && task && <section className="space-y-5" aria-label="作文真题内容">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div><p className="text-xs text-slate-500">{paper.title} · {task.label}</p><h4 className="mt-2 text-xl font-semibold text-[#193a35]">{task.title}</h4><p className="mt-1 text-[11px] text-slate-400">主题标题为整理标签，具体要求见原题</p></div>
        <span className="rounded-full bg-[#f5f1ec] px-3 py-1.5 text-xs text-slate-600">{task.score} 分 · 约 {task.wordCount} 词</span>
      </div>
      {view === 'text' ? type === 'APPLICATION' ? <article className="rounded-2xl border border-[#e5e9e2] bg-[#fafbf8] p-5 sm:p-7"><h5 className="mb-4 text-sm font-semibold">写作题目与作答格式</h5><div className="whitespace-pre-wrap break-words text-[15px] leading-8 text-slate-800">{task.text}</div></article> : <>
        <p className="text-sm leading-7 text-slate-600">{task.instruction}</p>
        <article className="rounded-2xl border border-[#e5e9e2] bg-[#fafbf8] p-5 sm:p-7"><h5 className="mb-4 text-sm font-semibold">阅读材料</h5><div className="whitespace-pre-wrap break-words font-serif text-[17px] leading-[1.95] text-slate-800">{task.material}</div></article>
        <div className="rounded-xl bg-[#f5f1ec] p-4 text-sm leading-7"><h5 className="mb-2 font-semibold">续写要求</h5><p className="whitespace-pre-wrap">{task.requirements}</p></div>
        <div className="space-y-3">{task.openingLines?.map((line,i) => <div key={i} className="rounded-xl border border-[#d8e2d7] p-4"><h5 className="mb-2 text-xs font-semibold text-[#496449]">第 {i+1} 段给定开头</h5><p className="font-serif text-base leading-7">{line}</p></div>)}</div>
      </> : <div className="space-y-4">{paper.sources.map(s => <figure key={s.artifactId} className="overflow-hidden rounded-xl border bg-white">
        <figcaption className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 text-xs text-slate-600"><span>写作原件 · {s.mime.includes('pdf') ? 'PDF（请查看写作部分）' : `页序 ${s.page}`}</span><a href={`${s.publicPath}${s.mime.includes('pdf') ? `#page=${s.page}` : ''}`} target="_blank" rel="noreferrer" className="underline">打开原件{ s.mime.includes('pdf') ? ' / 翻页' : ' / 放大'}</a></figcaption>
        {s.mime.includes('pdf') ? <iframe src={`${s.publicPath}#page=${s.page}`} title={`${paper.title}写作PDF原件`} className="h-[720px] w-full" /> : <a href={s.publicPath} target="_blank" rel="noreferrer"><img src={s.publicPath} alt={`${paper.title}写作原件页序${s.page}`} loading="lazy" className="h-auto w-full" /></a>}
      </figure>)}</div>}
      <details className="rounded-xl border p-4 text-xs text-slate-500"><summary className="cursor-pointer">题目来源与原件</summary><div className="mt-3 space-y-3">{paper.sources.map(s => <div key={s.artifactId} className="flex flex-wrap gap-3"><span>{s.sourceName} · 原件页序 {s.page}</span><a href={s.sourcePage} target="_blank" rel="noreferrer" className="underline">来源页面</a><a href={s.publicPath} target="_blank" rel="noreferrer" className="underline">本地原件</a></div>)}</div></details>
    </section>}
  </div>;
}

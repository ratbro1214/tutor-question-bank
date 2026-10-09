"use client";

import { useEffect, useState } from 'react';
type Paper = { id: string; year: number; volume: string; title: string; artifact_count: number; section_count: number };
type Artifact = { id: string; kind: string; filename: string; public_path: string | null; mime: string; source_page: string; source_url: string; sha256: string };
type Passage = { id: string; label: string; text: string; section_id: string };
type Detail = { paper: Paper; artifacts: Artifact[]; sections: { id: string; title: string }[]; passages: Passage[]; questions: { id: string; passage_id: string; number: number; stem: string }[]; options: { question_id: string; label: string; text: string }[] };

function CorpusPassage({ passage, detail }: { passage: Passage; detail: Detail }) {
  return <div className="mb-5 rounded-xl bg-[#faf8f5] p-4">
    <pre className="whitespace-pre-wrap break-words font-serif text-sm leading-7">{passage.text}</pre>
    {detail.questions.filter(q => q.passage_id === passage.id).map(q => <div key={q.id} className="mt-4 border-t pt-4 text-sm leading-7"><p className="font-medium">{q.number}. {q.stem}</p>{detail.options.filter(o => o.question_id === q.id).map(o => <p key={o.label}>{o.label}. {o.text}</p>)}</div>)}
  </div>;
}

export function EnglishCorpus() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [year, setYear] = useState('all');
  const [volume, setVolume] = useState('all');
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'original' | 'text'>('original');
  const [showAnswers, setShowAnswers] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/english/papers', { signal: controller.signal }).then(async r => { const j = await r.json() as { papers: Paper[]; error?: string }; if (!r.ok) throw Error(j.error); return j; }).then(j => setPapers(j.papers)).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail(null); setError(''); setShowAnswers(false);
    fetch(`/api/english/papers/${selected}`, { signal: controller.signal }).then(async r => { const j = await r.json() as Detail & { error?: string }; if (!r.ok) throw Error(j.error); return j; }).then(setDetail).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [selected]);
  const visible = papers.filter(p => (year === 'all' || String(p.year) === year) && (volume === 'all' || p.volume === volume));
  const assets = detail?.artifacts.filter(a => a.public_path && a.kind !== 'html_snapshot' && (showAnswers || a.kind !== 'answer')) || [];
  return <div className="space-y-5">
    <div className="rounded-2xl bg-[#f6f4ee] p-5">
      <h3 className="text-lg font-semibold">英语真题与模拟试卷</h3>
      <p className="mt-2 text-sm text-slate-600">已归档 {papers.length} 套试卷。选择年份与卷别即可查看本地原件；听力暂不整理。原件可能包含听力题和答案，结构化文本仅整理非听力部分。</p>
      <p className="mt-2 text-xs text-amber-800">各卷来源见文件校验记录 · 答案待复核 · 佛山2024一模题卷8页齐全，源网页仅提供答案第1–2页（共3页）</p>
    </div>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">年份 <select aria-label="真题年份" className="rounded-lg border p-2" value={year} onChange={e => setYear(e.target.value)}><option value="all">全部年份</option>{[...new Set(papers.map(p => p.year))].map(y => <option key={y} value={y}>{y}</option>)}</select></label>
      <label className="text-sm">卷别 <select aria-label="真题卷别" className="rounded-lg border p-2" value={volume} onChange={e => setVolume(e.target.value)}><option value="all">全部卷别</option>{[...new Set(papers.map(p => p.volume))].map(v => <option key={v} value={v}>{v === 'I' ? 'Ⅰ卷' : v === 'II' ? 'Ⅱ卷' : v}</option>)}</select></label>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid gap-2 sm:grid-cols-2">{visible.map(p => <button key={p.id} onClick={() => { setSelected(p.id); setView('original'); }} aria-pressed={selected === p.id} className={`rounded-xl border p-4 text-left ${selected === p.id ? 'border-[#325d4d] bg-[#edf3ee]' : 'hover:bg-slate-50'}`}><span className="block text-sm font-semibold">{p.title}</span><span className="mt-1 block text-xs text-slate-500">{p.artifact_count} 个原件 · {p.section_count ? '已有非听力文本' : '文本待整理'} · 待复核</span></button>)}</div>
    {selected && !detail && !error && <p role="status" className="text-sm text-slate-500">正在读取试卷…</p>}
    {detail && <section className="space-y-4 border-t pt-5" aria-label="真题原卷">
      <h4 className="text-lg font-semibold">{detail.paper.title}</h4>
      <div className="flex flex-wrap gap-2"><button className="rounded-lg border px-3 py-2 text-sm" aria-pressed={view === 'original'} onClick={() => setView('original')}>原卷预览</button><button className="rounded-lg border px-3 py-2 text-sm" aria-pressed={view === 'text'} onClick={() => setView('text')}>非听力文本</button><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showAnswers} onChange={e => setShowAnswers(e.target.checked)} />显示单独答案原件（待复核）</label></div>
      {view === 'original' ? <div className="space-y-4">{assets.map((a, i) => <div key={a.id} className="overflow-hidden rounded-xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 text-xs"><span>原件 {i + 1} · {a.kind === 'answer' ? '答案' : '试卷 / 题解'}</span><a href={a.public_path!} download className="underline">下载{a.filename.split('.').pop()?.toUpperCase()}原件</a></div>{a.mime.startsWith('image/') ? <a href={a.public_path!} target="_blank" rel="noreferrer"><img src={a.public_path!} alt={`${detail.paper.title}原件${i + 1}`} loading="lazy" className="h-auto w-full" /></a> : a.mime.includes('pdf') ? <iframe title={`${detail.paper.title}PDF原件`} src={a.public_path!} className="h-[720px] w-full" /> : <p className="p-4 text-sm text-slate-500">Word 原件可下载查看，下方图片提供在线预览。</p>}</div>)}</div> : <div className="space-y-4">{!detail.passages.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">本卷原件已经完整归档，结构化文本待整理。请切换到原卷预览。</p>}{detail.sections.map(s => <div key={s.id}><h5 className="mb-3 font-semibold">{s.title} · 自动提取，待校对</h5>{detail.passages.filter(p => p.section_id === s.id).map(p => <CorpusPassage key={p.id} passage={p} detail={detail} />)}</div>)}</div>}
      <details className="rounded-xl border p-3 text-xs text-slate-500"><summary className="cursor-pointer">查看来源与文件校验记录</summary>{detail.artifacts.filter(a => a.public_path).map(a => <div key={a.id} className="mt-3 space-y-1 break-all"><a href={a.source_page} target="_blank" rel="noreferrer" className="underline">来源页面</a><p>{a.filename}</p><p>SHA-256: {a.sha256}</p></div>)}</details>
    </section>}
  </div>;
}

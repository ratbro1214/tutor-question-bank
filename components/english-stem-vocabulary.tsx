"use client";

import { useEffect, useMemo, useState } from 'react';
import data from '@/data/english/stem-vocabulary.json';
import { extractStemTerms, type StemExample, type StemMatch } from '@/lib/english-stem-vocabulary';

const examples: StemExample[] = data.examples;

export function StemHints({ stem }: { stem: string }) {
  const terms = extractStemTerms(stem).filter((m, i, all) => all.findIndex(t => t.id === m.id) === i);
  if (!terms.length) return null;
  return <details className="my-3 rounded-lg bg-[#f5f7f4] p-3 text-sm">
    <summary className="cursor-pointer font-medium text-[#325d4d]">读懂题干 · {terms.map(t => t.word).filter((w, i, a) => a.indexOf(w) === i).join(' / ')}</summary>
    <div className="mt-3 space-y-3">{terms.map(t => <div key={t.id}><p><b>{t.matched}</b>：{t.meaning}{t.needsContext && <span className="ml-2 text-xs text-amber-800">两义待辨，需联系原文</span>}</p><p className="mt-1 text-xs leading-6 text-slate-600">{t.confusion} {t.strategy}</p></div>)}</div>
  </details>;
}

function HighlightedStem({ stem, matches, termId }: { stem: string; matches: StemMatch[]; termId: string }) {
  const selected = matches.filter(m => m.id === termId);
  const parts = selected.flatMap((m, index) => [
    <span key={`before-${m.start}`}>{stem.slice(index === 0 ? 0 : selected[index - 1].end, m.start)}</span>,
    <mark key={m.start} className="rounded bg-[#f1d4ad] px-0.5 text-[#193a35]">{stem.slice(m.start, m.end)}</mark>,
  ]);
  return <>{parts}{stem.slice(selected.at(-1)?.end ?? 0)}</>;
}

function OriginalContext({ example }: { example: StemExample }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/english/reading/${example.paperId}`, { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error('原文加载失败，请稍后重试'); return r.json() as Promise<{ passages: { label: string; text: string }[] }>; })
      .then(d => { const passage = d.passages.find(p => p.label === example.passage); if (!passage) throw new Error('未找到对应篇目'); setText(passage.text); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [example.paperId, example.passage]);
  return <div className="mt-3 rounded-lg bg-slate-50 p-4">
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : text ? <p className="whitespace-pre-wrap font-serif text-sm leading-7">{text}</p> : <p role="status" className="text-sm text-slate-500">正在读取对应原文…</p>}
    <p className="mt-3 break-all text-xs text-slate-500">题目 ID：{example.questionId} · 原件：{example.artifactId} · 定位：{example.sourceLocators.join('；')}</p>
  </div>;
}

export function EnglishStemVocabulary() {
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('all');
  const [volume, setVolume] = useState('all');
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState('suggest-inference');
  const [expanded, setExpanded] = useState('');
  const [input, setInput] = useState('What does the last paragraph suggest?');
  const [analyzed, setAnalyzed] = useState(input);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizChoice, setQuizChoice] = useState('');
  const scoped = useMemo(() => examples.filter(e => (year === 'all' || String(e.year) === year) && (volume === 'all' || e.volume === volume)), [year, volume]);
  const visibleTerms = data.terms.map(t => ({ ...t, count: scoped.filter(e => e.matches.some(m => m.id === t.id)).length }))
    .filter(t => t.count > 0 && (category === 'all' || t.category === category) && `${t.word} ${t.meaning} ${t.category}`.toLowerCase().includes(search.toLowerCase().trim()));
  const term = visibleTerms.find(t => t.id === selectedId) ?? visibleTerms[0];
  const currentExamples = term ? scoped.filter(e => e.matches.some(m => m.id === term.id)) : [];
  const quiz = examples.filter(e => e.matches.some(m => m.id.startsWith('suggest-') && !m.needsContext));
  const question = quiz[quizIndex % quiz.length];
  const correct = question.matches.find(m => m.id.startsWith('suggest-'))!;
  function exportCsv() {
    const rows = [['词或短语', '题干义', '类别', '真题', '篇目', '来源题号', '原题干', '需结合原文', '读题方法'],
      ...visibleTerms.flatMap(t => scoped.filter(e => e.matches.some(m => m.id === t.id)).map(e => [t.word, t.meaning, t.category, e.title, e.passage, String(e.number), e.stem, e.matches.find(m => m.id === t.id)!.needsContext ? '是' : '否', t.strategy]))];
    const csv = '\ufeff' + rows.map(row => row.map(v => `"${v.replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = '真题题干词汇.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-5">
    <div className="rounded-xl bg-[#f5f7f4] p-4 text-sm leading-7">
      <p className="font-semibold text-[#193a35]">先读懂问题，再寻找答案</p>
      <p>{data.paperCount} 套真题 · {data.questionCount} 道阅读题干 · {data.terms.length} 个命中词条 · {data.matchedQuestionCount} 道题含教学关键词</p>
      <p className="text-xs text-slate-500">仅提取阅读 A–D 的题干，不含选项和正文；同词不同义分列。题干仍待校对，释义和读题方法为教学整理。</p>
    </div>
    <div className="rounded-xl border border-[#e8dcc8] bg-[#fffaf1] p-4 text-sm leading-7">
      <p><b>suggest 的两种读法</b>：段落 suggest → 暗示、表明；人物 suggest … do → 建议做什么。</p>
      <p className="text-xs text-slate-600">人物作主语也可能表达暗示。题干信息不足时会展示两义，请展开原文判断。</p>
      <a href={data.dictionaryUrl} target="_blank" rel="noreferrer" className="text-xs underline">词义参考：Cambridge Dictionary</a>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label>搜索 <input value={search} onChange={e => setSearch(e.target.value)} placeholder="suggest / 暗示 / 主旨" className="w-48 rounded-lg border px-3 py-2" /></label>
      <label>年份 <select value={year} onChange={e => { setYear(e.target.value); setExpanded(''); }} className="rounded-lg border p-2"><option value="all">全部</option>{[...new Set(examples.map(e => e.year))].map(y => <option key={y} value={y}>{y}</option>)}</select></label>
      <label>卷别 <select value={volume} onChange={e => { setVolume(e.target.value); setExpanded(''); }} className="rounded-lg border p-2"><option value="all">全部</option><option value="I">Ⅰ卷</option><option value="II">Ⅱ卷</option></select></label>
      <label>用途 <select value={category} onChange={e => setCategory(e.target.value)} className="rounded-lg border p-2"><option value="all">全部</option>{[...new Set(data.terms.map(t => t.category))].map(c => <option key={c}>{c}</option>)}</select></label>
      <button disabled={!visibleTerms.length} onClick={exportCsv} className="rounded-lg border px-3 py-2 disabled:opacity-40">导出筛选词表</button>
    </div>
    <p className="text-xs text-slate-500">当前范围 {scoped.length} 道题 · {visibleTerms.length} 个词条。计数为含该词条的题数；待判义的 suggest 同时列入两义，不能相加。</p>
    {!term ? <p role="status" className="rounded-xl bg-slate-50 p-5 text-sm">当前条件没有命中词条，请调整筛选。</p> : <>
      <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto" aria-label="题干关键词">{visibleTerms.map(t => <button key={t.id} aria-pressed={term.id === t.id} onClick={() => { setSelectedId(t.id); setExpanded(''); }} className={`rounded-lg border px-3 py-2 text-left text-sm ${term.id === t.id ? 'border-[#193a35] bg-[#edf3ee]' : 'hover:bg-slate-50'}`}><b>{t.word}</b> · {t.meaning}<span className="ml-2 text-xs text-slate-500">{t.count} 题</span></button>)}</div>
      <article className="rounded-xl border p-5">
        <p className="text-xs text-[#325d4d]">{term.category}</p><h4 className="mt-1 text-xl font-semibold">{term.word} <span className="text-base font-normal">{term.meaning}</span></h4>
        <p className="mt-3 text-sm leading-7"><b>容易误解：</b>{term.confusion}</p><p className="text-sm leading-7"><b>读题方法：</b>{term.strategy}</p>
        <div className="mt-4 space-y-3">{currentExamples.map(e => <div key={e.questionId} className="rounded-lg border p-3">
          <p className="text-xs text-slate-500">{e.title} · 阅读 {e.passage} · 来源题号 {e.number}</p>
          <p className="mt-2 text-sm leading-7"><HighlightedStem stem={e.stem} matches={e.matches} termId={term.id} /></p>
          {e.matches.find(m => m.id === term.id)?.needsContext && <p className="mt-1 text-xs text-amber-800">此题干不能单独确定 suggest 的词义，请联系原文判断。</p>}
          <button aria-expanded={expanded === e.questionId} onClick={() => setExpanded(expanded === e.questionId ? '' : e.questionId)} className="mt-2 text-xs text-[#325d4d] underline">{expanded === e.questionId ? '收起原文' : '结合原文与出处理解'}</button>
          {expanded === e.questionId && <OriginalContext key={e.questionId} example={e} />}
        </div>)}</div>
      </article>
    </>}
    <section className="rounded-xl border p-4" aria-label="suggest 词义辨析">
      <h4 className="font-semibold">用真题练习：这里的 suggest 是什么意思？</h4>
      <p className="mt-2 text-xs text-slate-500">{question.title} · 来源题号 {question.number} · {quizIndex % quiz.length + 1} / {quiz.length}</p>
      <p className="my-3 text-sm leading-7">{question.stem}</p>
      <div className="flex flex-wrap gap-2">{['suggest-inference', 'suggest-advice'].map(id => <button key={id} aria-pressed={quizChoice === id} onClick={() => setQuizChoice(id)} className="rounded-lg border px-3 py-2 text-sm">{id === 'suggest-inference' ? '暗示；表明' : '建议；提议'}</button>)}</div>
      {quizChoice && <p role="status" className="mt-3 text-sm leading-7">{quizChoice === correct.id ? '判断正确。' : '再看一下题干结构。'}此处表示“{correct.meaning}”。{correct.confusion}</p>}
      <button onClick={() => { setQuizIndex(i => i + 1); setQuizChoice(''); }} className="mt-3 rounded-lg bg-[#193a35] px-3 py-2 text-xs text-white">下一题</button>
    </section>
    <section className="rounded-xl border p-4">
      <h4 className="font-semibold">粘贴新题干，识别读题关键词</h4>
      <label className="mt-2 block text-xs text-slate-500" htmlFor="stem-input">只粘贴问题句，不含正文和选项。按当前教学词表识别，未命中不代表没有生词。</label>
      <textarea id="stem-input" value={input} onChange={e => setInput(e.target.value)} rows={3} maxLength={3000} className="mt-2 w-full rounded-lg border p-3 text-sm" />
      <button disabled={!input.trim()} onClick={() => setAnalyzed(input.trim())} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">提取关键词</button>
      <StemHints stem={analyzed} />
      {analyzed && !extractStemTerms(analyzed).length && <p role="status" className="mt-3 text-sm text-slate-500">当前教学词表未命中该题干。</p>}
    </section>
  </div>;
}

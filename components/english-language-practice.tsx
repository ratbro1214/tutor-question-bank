"use client";
import { EnglishSourceCrops } from './english-source-crops';

import { useEffect, useState } from 'react';
import { blankContext, compareFillAnswer, type LanguageType } from '@/lib/english-language';

type Paper = { id: string; year: number; volume: string; title: string; question_count: number };
type Question = { id: string; passage_id: string; number: number; type: LanguageType; answer: string; answer_status: string };
type Option = { question_id: string; label: string; text: string };
type Metadata = { questions: { id: string; givenWord: string | null; acceptedAnswers: string[] }[] };
type Passage = { original_crops?: string | null; id: string; label: string; text: string; metadata: string };
type Evidence = { question_id: string; source_url: string; public_path: string | null; source_name: string; raw_answer: string };
type Detail = { paper: Paper; passages: Passage[]; questions: Question[]; options: Option[]; evidence: Evidence[] };

export function EnglishLanguagePractice({ type, onComplete }: { type: LanguageType; onComplete: () => void }) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperId, setPaperId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/english/language', { signal: controller.signal }).then(r => {
      if (!r.ok) throw Error('真题目录加载失败');
      return r.json() as Promise<{ papers: Paper[] }>;
    }).then(d => { setPapers(d.papers); setPaperId(d.papers[0]?.id ?? ''); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!paperId) return;
    const controller = new AbortController();
    fetch(`/api/english/language/${paperId}`, { signal: controller.signal }).then(r => {
      if (!r.ok) throw Error('试题加载失败');
      return r.json() as Promise<Detail>;
    }).then(setDetail).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [paperId]);

  const label = type === 'CLOZE' ? '完形填空' : '语法填空';
  const passage = detail?.passages.find(p => p.label === label);
  const questions = detail?.questions.filter(q => q.passage_id === passage?.id) ?? [];
  const metadata: Metadata = passage?.metadata ? JSON.parse(passage.metadata) : { questions: [] };
  const accepted = (q: Question) => q.answer.split(/\s*\/\s*/);
  const result = (q: Question) => type === 'CLOZE' ? { correct: answers[q.id] === q.answer, caseOnly: false } : compareFillAnswer(answers[q.id] ?? '', accepted(q));
  const answered = questions.filter(q => answers[q.id]?.trim()).length;
  const reviewed = questions.filter(q => checked[q.id]).length;
  const correct = questions.filter(q => checked[q.id] && result(q).correct).length;
  function changeAnswer(q: Question, value: string) {
    setAnswers(s => ({ ...s, [q.id]: value }));
    setChecked(s => ({ ...s, [q.id]: false }));
  }
  function reset() {
    setAnswers(s => Object.fromEntries(Object.entries(s).filter(([id]) => !questions.some(q => q.id === id))));
    setChecked(s => Object.fromEntries(Object.entries(s).filter(([id]) => !questions.some(q => q.id === id))));
  }
  return <div className="mt-6 space-y-5">
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f5f7f4] p-4">
      <label className="text-sm font-medium">年份与卷别 <select aria-label={`${label}年份与卷别`} value={paperId} onChange={e => { setDetail(null); setError(''); setPaperId(e.target.value); }} className="ml-2 max-w-full rounded-lg border bg-white px-3 py-2">{papers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
      <span className="text-xs text-slate-500">{papers.length} 套真题 · {papers.length * (type === 'CLOZE' ? 15 : 10)} 空</span>
    </div>
    <div className="rounded-xl border border-[#e6e8dc] bg-[#f4f4eb] p-4 text-xs leading-6 text-slate-600">
      {type === 'CLOZE' ? '先通读全文，再结合空前空后的语义、搭配和情节选词。点击文章中的空位可跳到对应选项。' : '有提示词：判断词性、词形及句法作用。无提示词：检查冠词、介词、连词和从句关系。可输入多个单词；注意句首大写。'}
      <p>答案按来源题号对应，尚未逐题复核。作答后可查看答案原件；练习进度保留在当前模块会话中。</p>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!detail && !error && <p className="text-sm text-slate-500">正在加载{label}…</p>}
    {detail && !passage && <p role="alert">该试卷暂无{label}内容。</p>}
    {detail && passage && <>
      <article className="rounded-2xl border border-[#e5e9e2] bg-[#fafbf8] p-5 sm:p-7">
        <h4 className="mb-4 text-sm font-semibold text-[#193a35]">{detail.paper.title} · {label}</h4>
        <div className="whitespace-pre-wrap font-serif text-[17px] leading-[2.1] text-slate-800">{passage.text.split(/(\[\[\d+\]\])/).map((part, i) => {
          const match = part.match(/^\[\[(\d+)\]\]$/);
          if (!match) return part;
          const q = questions.find(q => q.number === Number(match[1]));
          if (!q) return part;
          const value = answers[q.id];
          const display = type === 'CLOZE' ? detail.options.find(o => o.question_id === q.id && o.label === value)?.text : value;
          return <button key={i} onClick={() => document.getElementById(`language-${q.id}`)?.focus()} aria-label={`跳到第 ${q.number} 空`} className={`mx-1 inline rounded border-b-2 px-2 font-sans text-sm ${checked[q.id] ? result(q).correct ? 'border-green-700 bg-green-50 text-green-800' : 'border-amber-700 bg-amber-50 text-amber-900' : 'border-[#66836f] bg-[#eef3ee] text-[#193a35]'}`}>{q.number} · {display || '____'}</button>;
        })}</div>
      </article>
      <EnglishSourceCrops payload={passage.original_crops} />
      <nav aria-label="答题进度" className="flex flex-wrap gap-2">{questions.map(q => <button key={q.id} onClick={() => document.getElementById(`language-${q.id}`)?.focus()} aria-label={`第 ${q.number} 空${checked[q.id] ? '，已对照' : answers[q.id]?.trim() ? '，已作答' : '，未作答'}`} className={`rounded-lg border px-3 py-2 text-xs ${checked[q.id] ? result(q).correct ? 'border-green-600 bg-green-50' : 'border-amber-600 bg-amber-50' : answers[q.id]?.trim() ? 'border-[#66836f] bg-[#eef3ee]' : 'border-slate-200'}`}>{q.number}</button>)}</nav>
      <div className="space-y-4">{questions.map(q => {
        const givenWord = metadata.questions.find(m => m.id === q.id)?.givenWord;
        const status = result(q);
        return <fieldset key={q.id} className="scroll-mt-8 rounded-xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-semibold">第 {q.number} 空{givenWord ? ` · 提示词：${givenWord}` : type === 'GRAMMAR_FILL' ? ' · 无提示词' : ''}</legend>
          <p className="mb-3 whitespace-pre-wrap text-xs leading-6 text-slate-500">{blankContext(passage.text, q.number).replace(/\[\[(\d+)\]\]/g, '____($1)')}</p>
          {type === 'CLOZE' ? <div className="grid gap-2 sm:grid-cols-2">{detail.options.filter(o => o.question_id === q.id).map((o, i) => <label key={o.label} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-6 ${answers[q.id] === o.label ? 'border-[#193a35] bg-[#eef3ee]' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input id={i === 0 ? `language-${q.id}` : undefined} type="radio" name={q.id} value={o.label} checked={answers[q.id] === o.label} onChange={() => changeAnswer(q, o.label)} className="mt-1.5 accent-[#193a35]" /><span><b className="mr-2">{o.label}.</b>{o.text}</span>
          </label>)}</div> : <label className="block text-xs text-slate-600">第 {q.number} 空答案<input id={`language-${q.id}`} aria-label={`第 ${q.number} 空答案`} value={answers[q.id] ?? ''} onChange={e => changeAnswer(q, e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="none" placeholder={givenWord ? `填写 ${givenWord} 的适当形式` : '填写适当的词'} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:outline-2 focus:outline-[#66836f]" /></label>}
          <button disabled={!answers[q.id]?.trim()} onClick={() => setChecked(s => ({ ...s, [q.id]: true }))} className="mt-3 rounded-lg bg-[#193a35] px-4 py-2 text-xs text-white disabled:opacity-40">对照第 {q.number} 空答案</button>
          {checked[q.id] && <div aria-live="polite" className="mt-3 rounded-lg bg-[#f5f3ee] p-3 text-sm leading-6">
            <p>{status.correct ? '与来源答案一致' : status.caseOnly ? '词形一致，大小写与来源答案不同；请检查句首位置' : '与来源答案不同'} · 来源答案：<b>{q.answer}</b></p>
            <p className="text-xs text-slate-500">你的答案：{answers[q.id]}{type === 'CLOZE' ? ` · ${detail.options.find(o => o.question_id === q.id && o.label === q.answer)?.text ?? ''}` : ''}</p>
            {detail.evidence.filter(e => e.question_id === q.id).slice(0, 1).map(e => {
              const source: {rawAnswer: string; normalizationReason?: string} = JSON.parse(e.raw_answer);
              return <div key={e.source_url}>{source.normalizationReason && <p className="text-xs text-slate-500">原件答案：{source.rawAnswer}。{source.normalizationReason}</p>}<a href={e.public_path ?? e.source_url} target="_blank" rel="noreferrer" className="text-xs underline">查看答案原件 · {e.source_name}</a></div>;
            })}
          </div>}
        </fieldset>;
      })}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f5f7f4] p-4 text-xs text-slate-600">
        <span aria-live="polite">已作答 {answered}/{questions.length} · 已对照 {reviewed}/{questions.length}{reviewed > 0 ? ` · 一致 ${correct} 空 · ${correct * (type === 'CLOZE' ? 1 : 1.5)} / 15 分` : ''}</span>
        <div className="flex gap-2"><button onClick={reset} className="rounded-lg border bg-white px-3 py-2">重新练习本篇</button><button disabled={!questions.length || answered !== questions.length} onClick={() => { setChecked(s => ({ ...s, ...Object.fromEntries(questions.map(q => [q.id, true])) })); onComplete(); }} className="rounded-lg bg-[#193a35] px-3 py-2 text-white disabled:opacity-40">对照本篇全部答案</button></div>
      </div>
    </>}
  </div>;
}

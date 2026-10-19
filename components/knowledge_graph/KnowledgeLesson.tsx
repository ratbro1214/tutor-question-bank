'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Lightbulb, ChevronDown } from 'lucide-react';
import { MathText } from '@/components/math-text';
import type { KnowledgeLesson as Lesson } from '@/lib/knowledge_graph/learning-types';

export function KnowledgeLesson({ code }: { code: string }) {
  const [lesson, setLesson] = useState<Lesson | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/knowledge-graph/lessons?code=' + encodeURIComponent(code), { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw Error('学习讲义暂时无法读取。');
      return response.json() as Promise<{ lesson: Lesson | null }>;
    }).then(data => { if (!controller.signal.aborted) setLesson(data.lesson); })
      .catch(e => { if (!controller.signal.aborted) setError((e as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [code, retry]);
  if (loading) return <p role="status" className="text-xs text-slate-500">正在读取知识说明与例题…</p>;
  if (error) return <div role="alert" className="rounded-xl bg-amber-50 p-4 text-xs text-amber-900">{error}<button type="button" className="ml-3 underline" onClick={() => { setError(''); setLoading(true); setRetry(n => n + 1); }}>重试</button></div>;
  if (!lesson) return <p className="text-xs leading-6 text-slate-500">此节点尚未补充专门讲义，可先阅读上方知识简介。</p>;
  return <section className="space-y-5" aria-label="知识说明与入门例题">
    <div><div className="mb-3 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><BookOpen size={15} className="text-indigo-500" />知识说明</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">学习讲义</span></div><div className="space-y-3">{lesson.explanation.map((paragraph, i) => <MathText key={i} className="text-sm leading-7 text-slate-600">{paragraph}</MathText>)}</div></div>
    <div className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Lightbulb size={15} className="text-amber-500" />简单例题<span className="ml-auto text-[10px] font-normal text-slate-400">先尝试，再看解答</span></h3>{lesson.examples.map((example, i) => <article key={example.focus} className="overflow-hidden rounded-xl border border-indigo-100 bg-indigo-50/30"><div className="p-4"><p className="mb-3 text-[10px] leading-5 text-indigo-600">例 {i + 1} · {example.focus}</p><MathText className="text-sm leading-7 text-slate-800">{example.question}</MathText></div><details className="group border-t border-indigo-100 bg-white"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-medium text-indigo-700 [&::-webkit-details-marker]:hidden">查看答案与解析<ChevronDown size={14} className="transition group-open:rotate-180" /></summary><div className="space-y-4 px-4 pb-4"><div className="rounded-lg bg-emerald-50 p-3"><p className="mb-1 text-[10px] text-emerald-700">答案</p><MathText className="text-sm leading-7 text-emerald-950">{example.answer}</MathText></div><ol className="list-outside list-decimal space-y-2 pl-4 text-xs leading-7 text-slate-600">{example.steps.map((step, index) => <li key={index}><MathText>{step}</MathText></li>)}</ol></div></details></article>)}</div>
    <p className="text-[10px] leading-5 text-slate-400">独立编写的基础教学示例，待教师核查；不代表真题，不计入关联题数。章节与上层知识展示其所属内容的代表例题。</p>
  </section>;
}

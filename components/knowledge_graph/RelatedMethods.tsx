'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, TriangleAlert } from 'lucide-react';
import { MathText } from '@/components/math-text';
import type { GraphMethod } from '@/lib/knowledge-graph';
import type { OpenMathCatalog } from '@/lib/open-math';
import { relatedMethods } from '@/lib/knowledge_graph/related-methods';
import type { StarNode, StarSnapshot } from '@/lib/knowledge_graph/star-map';

export function RelatedMethods({ node, snapshot, approvedOnly, onReadKnowledge }: { node: StarNode; snapshot: StarSnapshot; approvedOnly: boolean; onReadKnowledge: () => void }) {
  const [data, setData] = useState<{ methods: GraphMethod[]; catalog: OpenMathCatalog } | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(''), [showContext, setShowContext] = useState(false);
  const reader = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The desktop panel owns its scroll; opening a card should start at its title.
    const panel = reader.current?.closest('aside');
    panel?.scrollTo({ top: 0 });
    panel?.parentElement?.scrollTo({ top: 0 });
  }, [selected, loading]);
  useEffect(() => {
    const controller = new AbortController();
    async function read<T>(url: string): Promise<T> {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw Error('方法资料读取失败，请重试。');
      return response.json() as Promise<T>;
    }
    void Promise.all([read<{ items: GraphMethod[] }>(`/api/knowledge-graph/methods?approved=${approvedOnly}`), read<OpenMathCatalog>('/api/knowledge-graph/public')])
      .then(([methods, catalog]) => { if (!controller.signal.aborted) setData({ methods: methods.items, catalog }); })
      .catch(e => { if (!controller.signal.aborted) setError((e as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [approvedOnly, retry]);
  const matches = data ? relatedMethods(node, snapshot, data.methods, data.catalog, approvedOnly) : [];
  const direct = matches.filter(m => m.direct), context = matches.filter(m => !m.direct);
  const current = matches.find(m => m.id === selected);
  const list = (items: typeof matches) => <div className="space-y-2">{items.map(method => <button key={method.id} type="button" onClick={() => setSelected(method.id)} className="group w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/50"><div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold text-slate-900">{method.content.name}</span><ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-indigo-600" /></div><p className="mt-2 text-[11px] text-slate-500">{method.match} · {method.status === 'approved' ? '已审核方法' : method.status === 'candidate' ? '待审核方法' : '公共参考 · 待核查'}</p><MathText className="mt-3 line-clamp-2 text-xs leading-6 text-slate-600">{method.content.summary}</MathText></button>)}</div>;
  const lines = (title: string, values: string[], tone = '') => !!values.length && <section className={`rounded-xl p-4 ${tone || 'border border-slate-100 bg-slate-50/60'}`}><h4 className="mb-3 text-sm font-semibold text-slate-900">{title}</h4><ol className="list-outside list-decimal space-y-2 pl-4 text-sm leading-7 text-slate-700">{values.map((text, i) => <li key={i}><MathText>{text}</MathText></li>)}</ol></section>;
  if (loading) return <p role="status" className="p-6 text-sm text-slate-500">正在查找与此知识点相关的方法…</p>;
  if (error) return <div role="alert" className="space-y-3 p-5 text-sm text-red-700"><p>{error}</p><button type="button" className="rounded-lg border px-3 py-2" onClick={() => { setError(''); setLoading(true); setRetry(n => n + 1); }}>重新加载</button></div>;
  return <div ref={reader} className="space-y-4 p-5" aria-label="当前知识的关联方法">
    {current ? <>
      <button type="button" onClick={() => setSelected('')} className="flex items-center gap-2 text-xs text-indigo-600"><ArrowLeft size={14} />返回关联方法</button>
      <div><p className="mb-2 text-[11px] text-slate-500">{current.match} · {current.status === 'approved' ? '已审核方法' : current.status === 'candidate' ? '待审核方法' : '公共参考 · 待核查'}</p><h3 className="text-lg font-semibold text-slate-950">{current.content.name}</h3><MathText className="mt-3 text-sm leading-7 text-slate-600">{current.content.summary}</MathText></div>
      {!current.direct && <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">这是扩展参考，尚未确认适用于「{node.name}」，请先核对以下条件。</p>}
      {lines('什么时候用', current.content.conditions, 'border border-emerald-100 bg-emerald-50/50')}
      {current.content.motivation && current.content.motivation !== current.content.summary && <section><h4 className="mb-2 text-sm font-semibold">为什么想到这个方法</h4><MathText className="text-sm leading-7 text-slate-600">{current.content.motivation}</MathText></section>}
      {lines('解题步骤', current.content.steps)}
      {lines('使用边界与易错点', [...new Set([...current.content.limitations, ...current.content.mistakes, ...(current.content.strategy?.checks ?? [])])], 'border border-amber-100 bg-amber-50/50')}
      {!!current.content.strategy?.alternatives.length && <section><h4 className="mb-3 text-sm font-semibold">还可以怎么解</h4><div className="space-y-3">{current.content.strategy.alternatives.map((alternative, i) => <article key={i} className="rounded-xl border border-indigo-100 p-4"><MathText className="text-sm font-medium text-indigo-800">{alternative.name}</MathText><MathText className="mt-2 text-xs leading-6 text-slate-600">{'优点：' + alternative.advantage + '\n代价与限制：' + alternative.cost}</MathText></article>)}</div></section>}
      {lines('方法变式', current.content.variants)}
      {!!current.content.strategy?.examples.length && <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium text-slate-700">教学例题 · 随卡待核查</summary><div className="mt-4 space-y-4">{current.content.strategy.examples.map((example, i) => <section key={i} className="space-y-3 text-sm leading-7 text-slate-600"><MathText>{example.statement}</MathText><MathText>{example.solution}</MathText></section>)}</div></details>}
      <details className="border-t border-slate-100 pt-3"><summary className="cursor-pointer text-xs text-slate-500">来源与核查信息</summary><p className="mt-3 break-words text-xs leading-6 text-slate-500">{current.source}</p>{current.sourceUrl && <a className="mt-2 block text-xs text-indigo-600 underline" href={current.sourceUrl} target="_blank" rel="noreferrer">查看原始资料 ↗</a>}<p className="mt-2 text-xs leading-6 text-slate-400">方法的审核状态不代表它与当前知识点的适用关系已经审核。</p></details>
    </> : <>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><BookOpen size={16} className="text-indigo-500" />适用于当前知识的线索<span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">{direct.length}</span></div>
      {direct.length ? list(direct) : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5"><TriangleAlert size={20} className="mb-3 text-amber-500" /><p className="text-sm font-medium text-slate-800">暂无{approvedOnly ? '已审核的' : ''}直接匹配方法</p><p className="mt-2 text-xs leading-6 text-slate-500">「{node.name}」尚未建立对应方法，可以先通过知识说明和入门例题理解它。</p><button type="button" onClick={onReadKnowledge} className="mt-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"><BookOpen size={14} />阅读知识说明与例题<ChevronRight size={13} /></button></div>}
      {!!context.length && <section className="space-y-3 border-t border-slate-100 pt-4"><button type="button" aria-expanded={showContext} onClick={() => setShowContext(value => !value)} className="flex w-full items-center justify-between rounded-lg bg-indigo-50 px-3 py-3 text-xs font-medium text-indigo-700"><span>上级知识与同章参考 · {context.length}</span><span>{showContext ? '收起' : '展开'}</span></button>{showContext && <><p className="text-xs leading-6 text-slate-500">扩大到上级知识或当前章节，仅作选法参考，不代表适用于当前题型。</p>{list(context)}</>}</section>}
      {approvedOnly && <p className="text-xs leading-6 text-slate-400">正式图谱仅显示已审核方法；待审核方法和公共参考可在审核预览中查看。</p>}
    </>}
  </div>;
}

"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { graphRequest } from './knowledge-methods';
import type { GraphRelation } from '@/lib/knowledge-graph';
import { StrategyDecisionPanel } from './strategy-decision';
export function QuestionMethodEvidence({ id, knowledge = [], methods = [] }: { id: string; knowledge?: string[]; methods?: string[] }) {
  const [items, setItems] = useState<GraphRelation[]>([]), [error, setError] = useState(''), [loading,setLoading]=useState(true);
  useEffect(() => { const c = new AbortController(); void graphRequest<{ items: GraphRelation[] }>('/relations?canonicalId=' + encodeURIComponent(id), undefined, 'GET', c.signal).then(d => setItems(d.items.filter(r=>r.type==='uses'))).catch(e => { if (!c.signal.aborted) setError(e.message); }).finally(()=>{if(!c.signal.aborted)setLoading(false);}); return () => c.abort(); }, [id]);
  return <section className="surface-card space-y-6 p-5"><h2 className="text-lg font-semibold">知识与方法</h2>
    <StrategyDecisionPanel key={id} canonicalId={id} />
    <div className="space-y-3"><h3 className="text-sm font-semibold">本题考查</h3>{knowledge.length?<div className="flex flex-wrap gap-2">{knowledge.map(k=><span key={k} className="rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-900">{k}</span>)}</div>:<p className="text-sm text-slate-500">尚未标注知识点。</p>}<Link className="block rounded-xl border p-3 text-sm font-medium text-terracotta-800 hover:bg-slate-50" href="/knowledge-graph">查看知识图谱 →<span className="mt-1 block text-xs font-normal text-slate-500">了解知识点之间的联系与先修知识</span></Link></div>
    <div className="space-y-3 border-t pt-5"><h3 className="text-sm font-semibold">解题方法</h3>{methods.length>0&&<p className="text-sm leading-6 text-slate-700">方法提示：{methods.join('、')}</p>}{loading?<p className="text-sm text-slate-500">正在读取关联方法…</p>:error?<p className="text-sm text-amber-700">{error}</p>:items.length?items.map(r=><div key={r.id} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-medium">{r.method_name||'已关联方法'}</p><p className="mt-1 text-xs text-slate-500">教师已审核</p></div>):<p className="text-sm leading-6 text-slate-500">尚未关联方法卡，可在方法库中补充本题的解题方法。</p>}<Link className="block rounded-xl border p-3 text-sm font-medium text-terracotta-800 hover:bg-slate-50" href="/math-methods">查看与维护方法卡 →<span className="mt-1 block text-xs font-normal text-slate-500">查看适用条件、步骤与常见错误</span></Link></div>
  </section>;
}

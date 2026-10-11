"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { graphRequest } from './knowledge-methods';
import type { GraphRelation } from '@/lib/knowledge-graph';
export function QuestionMethodEvidence({ id }: { id: string }) {
  const [items, setItems] = useState<GraphRelation[]>([]), [error, setError] = useState('');
  useEffect(() => { const c = new AbortController(); void graphRequest<{ items: GraphRelation[] }>('/relations?canonicalId=' + encodeURIComponent(id), undefined, 'GET', c.signal).then(d => setItems(d.items)).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [id]);
  return <section className="surface-card space-y-2 p-5"><h3 className="font-semibold">知识图谱方法证据</h3>{error ? <p className="text-sm text-amber-700">{error}</p> : !items.length ? <p className="text-sm text-slate-500">暂无有效的已审核方法关联，可在方法库中选择具体解法建立候选。</p> : items.filter(r => r.type === 'uses').map(r => <p key={r.id} className="text-sm">{r.method_name || "已审核方法"} · {r.source.note} · 来源匹配版本 {r.source.evidence?.matchRevision}</p>)}<Link className="text-sm underline" href="/math-methods">查看与维护方法卡 →</Link><Link className="ml-4 text-sm underline" href="/knowledge-graph">打开知识图谱 →</Link></section>;
}

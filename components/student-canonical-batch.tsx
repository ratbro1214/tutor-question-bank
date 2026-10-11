'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { readApiResponse } from '@/lib/api-response';
import { importStudentQuestions, type BatchImportResult } from '@/lib/student-canonical-batch';

export function StudentCanonicalBatch({ studentId, allIds, filteredIds, selected, onSelect, busy, onBusyChange }: { studentId: number; allIds: number[]; filteredIds: number[]; selected: Set<number>; onSelect: (ids: Set<number>) => void; busy: boolean; onBusyChange: (busy: boolean) => void }) {
  const [results, setResults] = useState<BatchImportResult[]>([]), [done, setDone] = useState(0), [total, setTotal] = useState(0);
  const active = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); }, []);
  async function run() {
    const ids = allIds.filter(id => selected.has(id));
    if (active.current || !ids.length) return;
    active.current = true; onBusyChange(true); setResults([]); setDone(0); setTotal(ids.length);
    const abort = new AbortController(); controller.current = abort;
    try {
      const rows = await importStudentQuestions(studentId, ids, async <T,>(url: string, body?: unknown) => readApiResponse<T>(await fetch(url, { cache: 'no-store', signal: abort.signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })), (done, total) => { if (!abort.signal.aborted) { setDone(done); setTotal(total); } }, abort.signal);
      if (!abort.signal.aborted) { setResults(rows); onSelect(new Set(rows.filter(r => r.status === 'failed').map(r => r.questionId))); }
    } finally { active.current = false; if (!abort.signal.aborted) onBusyChange(false); }
  }
  const failures = results.filter(r => r.status === 'failed');
  return <section className="mb-4 space-y-3 rounded-xl border border-terracotta-200 bg-terracotta-50/40 p-4" aria-label="批量加入统一数学题库">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy || !allIds.length} onClick={() => onSelect(new Set(allIds))}>全选全部 {allIds.length} 道</Button>
      {filteredIds.length !== allIds.length && <Button size="sm" variant="outline" disabled={busy || !filteredIds.length} onClick={() => onSelect(new Set(filteredIds))}>选择筛选结果 {filteredIds.length} 道</Button>}
      <Button size="sm" variant="ghost" disabled={busy || !selected.size} onClick={() => onSelect(new Set())}>取消全选</Button>
      <span className="text-sm text-slate-600">已选 {selected.size} 道</span>
      <Button size="sm" disabled={busy || !selected.size} onClick={() => void run()}>{busy ? `正在加入 ${done}/${total}` : selected.size === allIds.length && allIds.length ? '全部加入统一数学题库' : `加入所选 ${selected.size} 道`}</Button>
    </div>
    <p className="text-xs leading-5 text-slate-600">点击加入即确认所选题目已审核，使用已保存的题干和分类。已入库题目自动跳过；也可打开单题详情逐题核对。</p>
    {busy && <p role="status" className="text-sm">已处理 {done}/{total} 道，请保持页面打开。</p>}
    {!!results.length && <div role="status" className="space-y-2 text-sm"><p>处理完成：新增 {results.filter(r => r.status === 'added').length} 道，关联已有题 {results.filter(r => r.status === 'reused').length} 道，已入库跳过 {results.filter(r => r.status === 'already').length} 道，失败 {failures.length} 道。</p><Link className="text-terracotta-800 underline" href="/math-library">查看统一数学题库 →</Link></div>}
    {!!failures.length && <div className="space-y-2 text-sm"><p>失败题目已保留选中，修正后可再次点击加入。</p>{failures.map(r => <p key={r.questionId}><Link className="text-terracotta-800 underline" href={`/students/${studentId}/questions/${r.questionId}`}>题目 #{r.questionId}</Link>：{r.error}</p>)}</div>}
  </section>;
}

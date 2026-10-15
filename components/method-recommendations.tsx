"use client";
import { useRef, useState, useEffect } from 'react';
import { MathText } from './math-text';
import { SolutionPicker, graphButton, graphRequest } from './knowledge-methods';
import { recommendationLabels, type MethodRecommendation } from '@/lib/method-recommendation';

type Selection = { canonicalId: string; revisionId: string; reviewId: string };
type Response = { result: MethodRecommendation | null; methods: { id: string; name: string }[]; message: string; engine?: 'ai'|'rules' };
export function MethodRecommendations() {
  const [open,setOpen] = useState(false), [selection,setSelection] = useState<Selection | null>(null), [data,setData] = useState<Response | null>(null), [busy,setBusy] = useState(false), [error,setError] = useState(''), [saved,setSaved] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function analyze(selected: Selection) {
    controller.current?.abort(); const c = new AbortController(); controller.current = c;
    setSelection(selected); setData(null); setSaved([]); setError(''); setBusy(true);
    try { const d = await graphRequest<Response>('/recommendations', { action: 'analyze', ...selected }, 'POST', c.signal); if (!c.signal.aborted) setData(d); }
    catch(e) { if (!c.signal.aborted) setError((e as Error).message); } finally { if (!c.signal.aborted) setBusy(false); }
  }
  return <section className="space-y-4 rounded-2xl border bg-white p-5"><button className={graphButton} aria-expanded={open} onClick={() => setOpen(v => !v)}>题目智能推荐与一题多解对比 {open ? '收起' : '展开'}</button>{open && <>
    <p className="text-sm text-slate-500">选择题目与已审核解析，从该题库已审核方法中检索候选。分析结果待教师核对；确认前请检查条件和具体解法是否吻合。</p>
    <SolutionPicker onChoose={(q,reviewId) => void analyze({ canonicalId:q.id, revisionId:q.current_revision_id, reviewId })} />
    {busy && <p role="status">正在核验候选方法…</p>}{error && <p role="alert" className="text-red-700">{error}</p>}{data?.message && <p role="status">{data.message}</p>}
    {data?.result && <><div className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold">题目特征（{data.engine==='rules'?'规则召回':'AI 分析'}，待核对）</h3><p>知识点：{data.result.features.knowledge.join('、') || '待判断'}</p>{(['structure','constraints','goal'] as const).map(k => <MathText key={k}>{{ structure:'结构：',constraints:'约束：',goal:'目标：' }[k]+data.result!.features[k]}</MathText>)}</div>
    {!data.result.items.length && <p>未找到能够确认的候选方法，待人工判断。</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm"><caption className="mb-3 text-left font-semibold">方法适用性与教学比较 · AI 建议</caption><thead><tr>{['方法','选择理由与条件','效率与通用性','教学价值'].map(h => <th className="border p-3" key={h}>{h}</th>)}</tr></thead><tbody>{data.result.items.map(item => <tr key={item.methodId}><td className="border p-3">{data.methods.find(m => m.id===item.methodId)?.name}<p className="mt-2 text-amber-800">{recommendationLabels[item.verdict]}</p></td><td className="space-y-2 border p-3"><MathText>{item.reason}</MathText><MathText>{item.conditions}</MathText></td><td className="space-y-2 border p-3"><MathText>{item.efficiency}</MathText><MathText>{item.generality}</MathText></td><td className="border p-3"><MathText>{item.teachingValue}</MathText></td></tr>)}</tbody></table></div>
    {data.result.items.map(item => <article key={item.methodId} className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">{data.methods.find(m => m.id===item.methodId)?.name} · 本题解法与变式</h3><MathText>{'题干依据：'+item.evidence}</MathText>{item.steps.map((s,i) => <MathText key={i}>{`${i+1}. ${s}`}</MathText>)}<MathText>{item.variation}</MathText><button className={graphButton} disabled={busy || saved.includes(item.methodId) || !['preferred','alternative'].includes(item.verdict)} onClick={async () => {
      if (!selection) return; setBusy(true); setError(''); const c = new AbortController(); controller.current = c;
      try { await graphRequest('/recommendations', { action:'confirm', ...selection, methodId:item.methodId, methodRevision:item.methodRevision, operationId:crypto.randomUUID(), relationId:crypto.randomUUID() }, 'POST', c.signal); if (!c.signal.aborted) setSaved(v => [...v,item.methodId]); }
      catch(e) { if (!c.signal.aborted) setError((e as Error).message); } finally { if (!c.signal.aborted) setBusy(false); }
    }}>{saved.includes(item.methodId) ? '已入库关联' : '已核对适用条件与解析，确认关联'}</button></article>)}</>}
  </>}</section>;
}

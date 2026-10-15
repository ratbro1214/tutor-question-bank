"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MathText } from './math-text';
import { MathContentTabs } from './open-math-library';
import { methodContentSchema, type GraphMethod, type GraphSource, type MethodContent, type GraphQuestion } from '@/lib/knowledge-graph';

import { MethodAICompletion } from './method-ai-completion';
import { fillMissingThinking } from '@/lib/method-completion';
import { MethodThinking, methodListFields, methodTextFields } from './method-thinking';
import { MethodRecommendations } from './method-recommendations';
import { MethodNetwork, MethodStrategyDetails } from './method-strategy';
import { StrategyDecisionPanel } from './strategy-decision';
import { StrategyImport } from './strategy-import';

export const graphField = 'w-full rounded-lg border border-slate-200 bg-white p-2 text-sm';
export const graphButton = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40';
export const graphLabels = { candidate: '待审核', approved: '已审核', rejected: '已拒绝 / 撤销', contains: '包含', prerequisite: '先修', related: '相关', applies: '适用', uses: '使用方法' };
export async function graphRequest<T>(path: string, body?: unknown, method = 'POST', signal?: AbortSignal): Promise<T> {
  const r = await fetch('/api/knowledge-graph' + path, body === undefined ? { cache: 'no-store', signal } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = await r.json() as T & { error?: string }; if (!r.ok) throw Error(data.error || '操作失败。'); return data as T;
}
export function MethodCard({ method }: { method: GraphMethod }) {
  const c = method.content;
  return <div className="space-y-6 text-base leading-8 text-slate-700"><p><span className="rounded bg-amber-50 px-2 py-1">{graphLabels[method.status]}</span> · 版本 {method.revision}{!method.evidenceValid && ' · 来源已失效，正式查询已排除'}</p><section><h3 className="mb-2 font-semibold">核心思想</h3><MathText>{c.summary}</MathText></section>
    <MethodThinking content={c} />
    {c.strategy && <MethodStrategyDetails strategy={c.strategy} />}
    {(['typicalProblems', 'conditions', 'steps', 'limitations', 'mistakes', 'variants'] as const).map(key => <section key={key}><h3 className="mb-3 text-base font-semibold text-slate-900">{{ typicalProblems: '典型题型', conditions: '适用条件', steps: '通用流程', limitations: '局限与不适用条件', mistakes: '常见错误', variants: '方法变式' }[key]}</h3>{c[key].length ? <ol className="list-outside list-decimal space-y-3 pl-6 marker:font-medium marker:text-terracotta-700">{c[key].map((line, i) => <li key={i}><MathText>{line}</MathText></li>)}</ol> : <p className="text-slate-400">暂无数据</p>}</section>)}
    <p className="text-xs text-slate-500">来源：{method.source.note.replace(/^5C-pilot-v1:\d+\s*/, '')}</p>{method.source.evidence && <div className="space-y-1 text-xs"><Link className="underline" href={'/math-library/' + method.source.evidence.canonicalId}>查看来源题目与已审核解析 →</Link><p>解析匹配版本 {method.source.evidence.matchRevision} · 模型 {method.source.evidence.model || '未记录'} · 提示词 {method.source.evidence.promptVersion || '未记录'}</p></div>}
  </div>;
}
export function GraphQuestionList({ items }: { items: GraphQuestion[] }) { return <div className="space-y-3">{!items.length && <p className="text-sm text-slate-500">暂无符合当前审核筛选的真实题目。</p>}{items.map(q => <article key={q.id} className="rounded-lg border p-3 text-sm"><MathText className="line-clamp-5">{q.original_text}</MathText><p className="my-2 text-xs text-slate-500">{q.reviewed ? '有有效的已审核 5B 解析' : '暂无已审核 5B 解析'} · {q.classification?.knowledge_points?.map(k => k.name).join('、') || '知识点未分类'}</p><Link className="text-xs underline" href={'/math-library/' + q.id}>题目、原始解析与多种解法 →</Link></article>)}</div>; }

const emptyContent: MethodContent = { name: '', summary: '', typicalProblems: [], conditions: [], steps: [], limitations: [], mistakes: [], variants: [] };
const editableSource = (source: GraphSource): GraphSource => ({ ...source, note: source.note.replace(/^5C-pilot-v1:\d+\s*/, '') });
type MethodVersion = { revision: number; created_at: string; actor: string; snapshot?: { content: MethodContent; source: GraphSource; status: GraphMethod['status'] }; unavailable?: string };
type Selection = { id: string; current_revision_id: string; scope_id: string; text: string; pairedSolutions: { reviewId: string | null; filename: string; review: { quality: { verdict: string }; methods: unknown } | null }[] };
export function SolutionPicker({ onChoose }: { onChoose: (q: Selection, reviewId: string) => void }) {
  const [query, setQuery] = useState(''), [items, setItems] = useState<{ id: string; text: string }[]>([]), [selected, setSelected] = useState<Selection | null>(null), [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => {
    void fetch('/api/math-library?q=' + encodeURIComponent(query) + '&pageSize=10', { signal: controller.signal }).then(async r => { const d = await r.json() as { error?: string; items: { id: string; text: string }[] }; if (!r.ok) throw Error(d.error); setItems(d.items); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
  }, 300); return () => { clearTimeout(timer); controller.abort(); }; }, [query]);
  return <div className="space-y-2 rounded-xl bg-slate-50 p-3"><label className="block text-sm font-medium">选择真实题目和已审核解法<input aria-label="搜索来源题目" className={graphField} value={query} onChange={e => setQuery(e.target.value)} placeholder="输入题干关键词" /></label>
    <select aria-label="来源题目" className={graphField} value={selected?.id || ''} onChange={async e => { if (!e.target.value) { setSelected(null); return; } try { setError(''); const r = await fetch('/api/math-library/' + encodeURIComponent(e.target.value)); const d = await r.json() as Selection & { error?: string }; if (!r.ok) throw Error(d.error); setSelected(d); } catch (e) { setError((e as Error).message); } }}><option value="">请选择题目</option>{items.map(q => <option key={q.id} value={q.id}>{q.text.slice(0, 80)}</option>)}</select>
    {selected && <><p className="text-xs">只列出教师已接受且仍有效的 5B 解析。</p>{selected.pairedSolutions.filter(s => s.review?.quality.verdict === 'no_obvious_error' && s.reviewId).map((s, i) => <button type="button" className={graphButton} key={s.reviewId} onClick={() => onChoose(selected, s.reviewId!)}>选择 {s.filename} · 解法 {i + 1}</button>)}{!selected.pairedSolutions.some(s => s.review?.quality.verdict === 'no_obvious_error') && <p className="text-xs text-amber-700">暂无合格来源。请先在试卷解析页完成 5B 审核。</p>}</>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
export function MethodEditor({ method, scopeId, initial, onSaved, onCancel }: { method?: GraphMethod; scopeId: string; initial?: { content: MethodContent; source: GraphSource }; onSaved: (m: GraphMethod) => void; onCancel: () => void }) {
  const [content, setContent] = useState(method?.content || initial?.content || emptyContent), [source, setSource] = useState<GraphSource>(editableSource(method?.source || initial?.source || { origin: 'manual', note: '教师手动编写', evidence: null }));
  const [status, setStatus] = useState<GraphMethod['status']>(method?.status || 'candidate'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [similar, setSimilar] = useState<{ id: string; name: string }[]>([]);
  const [strategyText,setStrategyText] = useState(content.strategy ? JSON.stringify(content.strategy,null,2) : ''), [reviewedStrategy,setReviewedStrategy] = useState(false);
  return <form className="space-y-3" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { const valid = methodContentSchema.parse({ ...content, strategy: strategyText.trim() ? JSON.parse(strategyText) : undefined }), id = method?.id || crypto.randomUUID();
    if (valid.strategy && status === 'approved' && !reviewedStrategy) throw Error('请核对策略条件、例题、知识映射及方法关系后勾选审核确认。');
    const saved = await graphRequest<GraphMethod>(method ? '/methods/' + id : '/methods', { ...(method ? {} : { id }), operationId: crypto.randomUUID(), expectedRevision: method?.revision || 0, scopeId, status: initial && !method ? 'candidate' : status, content: valid, source }, method ? 'PUT' : 'POST'); onSaved(saved);
  } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
    <h2 className="font-semibold">{method ? '编辑与审核方法卡' : '新建方法候选'}</h2>
    {(['name', 'summary'] as const).map(key => <label key={key} className="block text-sm">{key === 'name' ? '方法名称' : '核心思想'}<textarea required className={graphField} value={content[key]} onChange={e => setContent(c => ({ ...c, [key]: e.target.value }))} /></label>)}
    {(['typicalProblems', 'conditions', 'steps', 'limitations', 'mistakes', 'variants'] as const).map(key => <label key={key} className="block text-sm">{{ typicalProblems: '典型题型', conditions: '适用条件（必填）', steps: '解题流程（必填）', limitations: '局限（必填，请核对）', mistakes: '常见错误', variants: '方法变式' }[key]} · 每行一项<textarea required={['conditions', 'steps', 'limitations'].includes(key)} className={graphField} rows={3} value={content[key].join('\n')} onChange={e => setContent(c => ({ ...c, [key]: e.target.value.split('\n') }))} onBlur={() => setContent(c => ({ ...c, [key]: c[key].map(s => s.trim()).filter(Boolean) }))} /></label>)}
    {(Object.keys(methodListFields) as (keyof typeof methodListFields)[]).map(key => <label key={key} className="block text-sm">{methodListFields[key]} · 每行一项<textarea className={graphField} rows={3} value={(content[key] || []).join('\n')} onChange={e => setContent(c => ({ ...c, [key]: e.target.value.split('\n') }))} onBlur={() => setContent(c => ({ ...c, [key]: (c[key] || []).map(s => s.trim()).filter(Boolean) }))} /></label>)}
    {(Object.keys(methodTextFields) as (keyof typeof methodTextFields)[]).map(key => <label key={key} className="block text-sm">{methodTextFields[key]}<textarea className={graphField} value={content[key] || ''} onChange={e => setContent(c => ({ ...c, [key]: e.target.value || undefined }))} /></label>)}
    <MethodAICompletion content={content} disabled={busy} onApply={(suggestion,note) => { setContent(c => fillMissingThinking(c,suggestion)); setSource(s => ({ ...s, note: s.note + '；' + note })); setStatus('candidate'); }} />
    <details className="quiet-details"><summary className="cursor-pointer text-sm font-medium">策略 2.0 结构化内容与关系（高级编辑）</summary><p className="my-2 text-xs text-slate-500">临界机制、等号、课内书写、教师拓展、知识编码及关系随整卡版本保存。身份 key 不可更改；关系使用目标卡的 key。</p><textarea aria-label="策略结构化 JSON" className={graphField+' font-mono'} rows={18} value={strategyText} onChange={e=>{setStrategyText(e.target.value);setReviewedStrategy(false);}} /></details>
    {!!strategyText && <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewedStrategy} onChange={e=>setReviewedStrategy(e.target.checked)} />我已核对数学条件、临界值、例题、知识映射和方法关系，确认本次整卡审核。</label>}
    <label className="block text-sm">来源说明<input className={graphField} required value={source.note} onChange={e => setSource(s => ({ ...s, note: e.target.value }))} /></label>
    <label className="block text-sm">审核状态<select className={graphField} value={status} disabled={!!initial && !method} onChange={e => setStatus(e.target.value as GraphMethod['status'])}>{(['candidate', 'approved', 'rejected'] as const).map(s => <option key={s} value={s}>{graphLabels[s]}</option>)}</select></label>
    {!!initial && !method && <p className="text-xs text-amber-700">5B 提取结果先存为候选，保存后再由教师审核。</p>}
    <div className="flex flex-wrap gap-2"><button disabled={busy} className={graphButton} type="submit">保存</button><button className={graphButton} type="button" onClick={onCancel}>取消</button><button className={graphButton} type="button" onClick={async () => { try { const d = await graphRequest<{ items: typeof similar }>('/methods', { action: 'similar', content: methodContentSchema.parse(content) }); setSimilar(d.items); } catch (e) { setError((e as Error).message); } }}>查询相似方法</button></div>
    {similar.map(s => <p key={s.id} className="text-xs">相似建议：{s.name}（请比较适用条件，不会自动合并）</p>)}{error && <p role="alert" className="whitespace-pre-wrap text-sm text-red-700">{error}</p>}
  </form>;
}

export function KnowledgeMethods() {
  return <MathContentTabs mode="methods"><TeacherKnowledgeMethods /></MathContentTabs>;
}
function TeacherKnowledgeMethods() {
  const deepLinkApplied = useRef(false);
  const [items, setItems] = useState<GraphMethod[]>([]), [scopes, setScopes] = useState<string[]>([]), [scopeId, setScope] = useState(''), [current, setCurrent] = useState<GraphMethod | null>(null), [editing, setEditing] = useState(false), [initial, setInitial] = useState<{ content: MethodContent; source: GraphSource } | undefined>(), [filter, setFilter] = useState(''), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [questions, setQuestions] = useState<GraphQuestion[]>([]), [page, setPage] = useState(1), [hasMore, setMore] = useState(false), [target, setTarget] = useState(''), [history, setHistory] = useState<MethodVersion[] | null>(null), [pickerMode, setPickerMode] = useState<'candidate' | 'link' | null>(null);
  useEffect(() => { const controller = new AbortController(); void Promise.all([graphRequest<{ items: GraphMethod[] }>('/methods?approved=false', undefined, 'GET', controller.signal), graphRequest<{ scopes: string[] }>('', undefined, 'GET', controller.signal)]).then(([m, g]) => {
    if (controller.signal.aborted) return;
    setItems(m.items); setScopes(g.scopes); setScope(s => s || g.scopes[0] || '');
    if (!deepLinkApplied.current) {
      deepLinkApplied.current = true;
      const params = new URLSearchParams(window.location.search), linked = m.items.find(m => m.id === params.get('method'));
      if (linked) { setScope(linked.scope_id); setCurrent(linked); }
      if (params.get('code')) setFilter(params.get('code')!);
    }
  }).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [refresh]);
  useEffect(() => { if (!current) return; const c = new AbortController(); void graphRequest<{ items: GraphQuestion[]; hasMore: boolean }>('/resources?approved=false&methodId=' + encodeURIComponent(current.id) + '&page=' + page, undefined, 'GET', c.signal).then(d => { setQuestions(d.items); setMore(d.hasMore); }).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [current, page, refresh]);
  const changed = (m: GraphMethod) => { setQuestions([]); setCurrent(m); setEditing(false); setInitial(undefined); setRefresh(r => r + 1); };
  async function choose(q: Selection, reviewId: string) { try { setError(''); if (pickerMode === 'candidate') { const d = await graphRequest<{ content: MethodContent; source: GraphSource }>('/candidates', { canonicalId: q.id, revisionId: q.current_revision_id, reviewId }); setInitial(d); setScope(q.scope_id); setCurrent(null); setEditing(true); }
    else if (current) { const { evidence } = await graphRequest<{ evidence: NonNullable<GraphSource['evidence']> }>('/evidence', { canonicalId: q.id, revisionId: q.current_revision_id, reviewId });
      await graphRequest('/relations', { id: crypto.randomUUID(), operationId: crypto.randomUUID(), expectedRevision: 0, scopeId: current.scope_id, status: 'candidate', type: 'uses', fromKnowledge: null, toKnowledge: null, methodId: current.id, canonicalId: q.id, revisionId: q.current_revision_id, source: { origin: 'manual', note: '教师选择的具体已审核解法，请审核方法关联', evidence } }); setRefresh(r => r + 1); }
    setPickerMode(null);
  } catch (e) { setError((e as Error).message); } }
  return <div className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">数学解题方法库</h1><p className="mt-2 text-sm text-slate-500">适用条件、解题流程与真实解法证据，由教师审核维护。</p></div><Link href="/knowledge-graph" className={graphButton}>进入知识图谱 →</Link></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2"><input className={graphField + ' max-w-xs'} placeholder="搜索方法名称或适用条件" aria-label="搜索方法" value={filter} onChange={e => setFilter(e.target.value)} /><select aria-label="题库范围" className={graphField + ' max-w-xs'} value={scopeId} onChange={e => { setScope(e.target.value); setCurrent(null); setEditing(false); setInitial(undefined); setHistory(null); }}>{scopes.map((s, i) => <option key={s} value={s}>可访问题库 {i + 1}</option>)}</select><button className={graphButton} disabled={!scopeId} onClick={() => { setCurrent(null); setInitial(undefined); setEditing(true); }}>新建方法</button><button className={graphButton} onClick={() => setPickerMode('candidate')}>从已审核 5B 通法提取</button></div>
    <StrategyImport key={'import-'+scopeId} scopeId={scopeId} onImported={()=>setRefresh(r=>r+1)} />
    <StrategyDecisionPanel key={'rules-'+scopeId} scopeId={scopeId} />
    <MethodRecommendations key={scopeId} />
    <MethodNetwork key={'network-'+scopeId} methods={items.filter(m=>m.scope_id===scopeId)} selected={current} onSelect={m=>{setQuestions([]);setCurrent(m);setEditing(false);setHistory(null);setPage(1);}} />
    {pickerMode && <SolutionPicker onChoose={choose} />}
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]"><aside className="space-y-2">{items.filter(m => m.scope_id === scopeId && JSON.stringify(m.content).includes(filter)).map(m => <button key={m.id} className={'w-full rounded-xl border p-4 text-left ' + (current?.id === m.id ? 'border-orange-400 bg-orange-50' : 'bg-white')} onClick={() => { setQuestions([]); setCurrent(m); setEditing(false); setInitial(undefined); setHistory(null); setPage(1); }}><b className="block text-sm">{m.content.name}</b><span className="text-xs text-slate-500">{graphLabels[m.status]} · v{m.revision}</span></button>)}{!items.length && <p className="text-sm text-slate-500">暂无方法卡。可在知识图谱中初始化待审核专题骨架。</p>}</aside>
      <section className="rounded-2xl border bg-white p-5">{editing ? <MethodEditor key={current?.id || initial?.content.name || 'new'} method={current || undefined} scopeId={current?.scope_id || scopeId} initial={initial} onSaved={changed} onCancel={() => setEditing(false)} /> : current ? <div className="space-y-5"><h2 className="text-xl font-semibold">{current.content.name}</h2><MethodCard method={current} /><div className="flex flex-wrap gap-2"><button className={graphButton} onClick={() => setEditing(true)}>编辑 / 审核</button><button className={graphButton} onClick={() => setPickerMode('link')}>添加题目解法关联</button><button className={graphButton} onClick={async () => { try { const d = await graphRequest<{ versions: MethodVersion[] }>('/methods/' + current.id); setHistory(d.versions); } catch (e) { setError((e as Error).message); } }}>查看版本与审核历史</button></div>
      {history !== null && <details open className="quiet-details"><summary className="text-sm">历史版本</summary><div className="max-h-96 space-y-3 overflow-auto">{history.map(v => <article className="rounded-lg border p-3 text-sm" key={v.revision}><b>版本 {v.revision}</b> · {v.created_at} · {v.actor}<p>{v.unavailable || (v.snapshot ? graphLabels[v.snapshot.status] + ' · ' + v.snapshot.content.name : '历史记录')}</p>{v.snapshot && <details className="quiet-details"><summary>查看该版本内容与来源</summary><MethodCard method={{ ...current, revision: v.revision, status: v.snapshot.status, content: v.snapshot.content, source: v.snapshot.source, evidenceValid: true }} /></details>}</article>)}</div></details>}
      <div className="rounded-lg bg-slate-50 p-3"><label className="text-sm">教师确认合并到另一张已审核方法卡<select className={graphField} value={target} onChange={e => setTarget(e.target.value)}><option value="">选择目标方法（保留原始证据与历史）</option>{items.filter(m => m.id !== current.id && m.scope_id === current.scope_id && m.status === 'approved').map(m => <option key={m.id} value={m.id}>{m.content.name}</option>)}</select></label><button disabled={!target || current.status !== 'approved'} className={graphButton} onClick={async () => { try { const t = items.find(m => m.id === target)!; changed(await graphRequest<GraphMethod>('/methods/' + current.id + '/merge', { targetId: target, operationId: crypto.randomUUID(), sourceRevision: current.revision, targetRevision: t.revision })); setTarget(''); } catch (e) { setError((e as Error).message); } }}>确认合并</button></div>
      <h3 className="font-semibold">引用该方法的真实题目</h3><GraphQuestionList items={questions} /><div className="flex gap-2"><button className={graphButton} disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</button><button className={graphButton} disabled={!hasMore} onClick={() => setPage(p => p + 1)}>下一页</button></div><Link className="text-sm underline" href="/knowledge-graph">在图谱中维护知识点和题目关联 →</Link></div> : <p className="text-sm text-slate-500">选择方法卡查看详情，或新建候选方法。</p>}</section></div>
  </div>;
}

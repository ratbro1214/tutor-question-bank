'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Network, Search, RefreshCw, RotateCcw, CircleDot, Layers3 } from 'lucide-react';
import { Graph } from './Graph';
import { NodeDetail } from './NodeDetail';
import { hierarchy, levelLabels, visibleGraph, type StarNode, type StarSnapshot } from '@/lib/knowledge_graph/star-map';

const empty: StarSnapshot = { nodes: [], edges: [] };
type ResponseData = StarSnapshot & { capabilities?: { canReviewSeed: boolean }; error?: string };
export function KnowledgeGraph() {
  const [snapshot, setSnapshot] = useState<StarSnapshot>(empty), [view, setView] = useState<'review' | 'approved'>('review');
  const [selected, setSelected] = useState(''), [chapter, setChapter] = useState(''), [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState(''), [crossLinks, setCrossLinks] = useState(true), [resetKey, setResetKey] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), [curator, setCurator] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/knowledge-graph/catalog?view=${view}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json() as ResponseData;
      if (!response.ok) throw Error(data.error || '知识库读取失败');
      if (controller.signal.aborted) return;
      setSnapshot(data); setCurator(Boolean(data.capabilities?.canReviewSeed));
      const roots = data.nodes.filter(n => n.level === 1).map(n => n.id);
      setExpanded(old => new Set([...roots, ...[...old].filter(id => data.nodes.some(n => n.id === id))]));
      setSelected(old => data.nodes.some(n => n.id === old) ? old : roots[0] ?? '');
      setChapter(old => data.nodes.some(n => n.id === old) ? old : '');
      const linked=data.nodes.find(n=>n.code===new URLSearchParams(window.location.search).get('code'));
      if(linked) {
        const linkedTree=hierarchy(data),path=linkedTree.path(linked.id);
        setSelected(linked.id);setChapter(path.find(id=>linkedTree.byId.get(id)?.level===2)||'');setExpanded(old=>new Set([...old,...path]));
      }
    }).catch(e => { if (!controller.signal.aborted) { setError(e.message); setSnapshot(empty); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [view, refresh]);
  const reload = () => { setLoading(true); setError(''); setRefresh(n => n + 1); };
  const changeView = (next: typeof view) => { if (next === view) return; setLoading(true); setError(''); setView(next); };
  const tree = useMemo(() => hierarchy(snapshot), [snapshot]);
  const visible = useMemo(() => visibleGraph(snapshot, expanded, chapter, crossLinks), [snapshot, expanded, chapter, crossLinks]);
  const chapters = snapshot.nodes.filter(n => n.level === 2);
  const choose = useCallback((id: string) => {
    const n = tree.byId.get(id); if (!n) return;
    setSelected(id); setQuery('');
    const path = tree.path(id), owner = path.find(p => tree.byId.get(p)?.level === 2);
    setChapter(owner ?? '');
    setExpanded(old => new Set([...old, ...path]));
  }, [tree]);
  const reset = () => { const root = snapshot.nodes.find(n => n.level === 1); setChapter(''); setSelected(root?.id ?? ''); setQuery(''); setExpanded(new Set(root ? [root.id] : [])); setResetKey(n => n + 1); };
  async function approve(node: StarNode, parentId?: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/knowledge-graph/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve_node', nodeId: node.id, expectedUpdatedAt: node.updated_at, ...(parentId ? { parentId } : {}) }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw Error(data.error || '审核失败');
      setNotice(`“${node.name}”已审核。`); reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const searchResults = query.trim() ? snapshot.nodes.filter(n => n.name.includes(query.trim()) || n.description.includes(query.trim())).slice(0, 30) : [];
  const chosen = tree.byId.get(selected);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-3 flex items-center gap-2 text-xs font-medium text-indigo-600"><Network size={15} />MATHEMATICS KNOWLEDGE GRAPH</div><h1 className="text-3xl font-semibold tracking-tight text-slate-950">数学知识星图</h1><p className="mt-3 text-sm leading-6 text-slate-500">从一个知识点出发，看见数学知识之间的联系。</p></div><Link href="/knowledge-graph" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-50"><ArrowLeft size={14} />知识与解题方法</Link></header>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[{ label: '知识节点', value: snapshot.nodes.length, note: '五层知识体系' }, { label: '数学章节', value: chapters.length, note: '高中数学核心内容' }, { label: '知识关系', value: snapshot.edges.length, note: '归属 · 前置 · 相关 · 进阶' }, { label: '已审核节点', value: snapshot.nodes.filter(n => n.knowledge_review_status === 'approved').length, note: '教师核验后进入正式图谱' }].map(item => <div key={item.label} className="rounded-xl border border-slate-200/80 bg-white px-4 py-4"><p className="text-xs text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{loading ? '—' : item.value}</p><p className="mt-1 text-[10px] leading-5 text-slate-400">{item.note}</p></div>)}</div>
    <section className="space-y-3" aria-label="图谱筛选">
      <div className="flex flex-wrap items-center gap-3"><div className="flex rounded-lg bg-slate-100 p-1">{[{ id: 'review', text: '审核预览' }, { id: 'approved', text: '正式图谱' }].map(m => <button key={m.id} type="button" aria-pressed={view === m.id} onClick={() => changeView(m.id as typeof view)} className={`rounded-md px-4 py-2 text-xs font-medium ${view === m.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{m.text}</button>)}</div>
        <div className="relative min-w-[220px] flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} aria-label="搜索知识点、考点或题型" placeholder="搜索知识点、考点或题型…" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
          {query && <div role="region" aria-label="搜索结果" className="absolute inset-x-0 top-12 z-30 max-h-72 overflow-y-auto rounded-xl border bg-white p-2 shadow-xl">{searchResults.length ? searchResults.map(n => <button key={n.id} type="button" onClick={() => choose(n.id)} className="flex w-full items-center justify-between gap-2 rounded-lg p-3 text-left text-sm hover:bg-indigo-50"><span>{n.name}</span><span className="shrink-0 text-[10px] text-slate-400">{levelLabels[n.level]}</span></button>) : <p className="p-3 text-sm text-slate-500">没有找到匹配知识，试试更短的关键词。</p>}</div>}
        </div><button type="button" onClick={reset} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600"><RotateCcw size={14} />总览</button><button type="button" aria-label="刷新知识库" disabled={loading} onClick={reload} className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500"><RefreshCw size={16} /></button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="章节选择"><button type="button" aria-pressed={!chapter} onClick={reset} className={`shrink-0 rounded-full border px-3 py-2 text-xs ${!chapter ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}>全部章节</button>{chapters.map(n => <button type="button" key={n.id} aria-pressed={chapter === n.id} onClick={() => choose(n.id)} className={`shrink-0 rounded-full border px-3 py-2 text-xs ${chapter === n.id ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-200'}`}>{n.name}</button>)}</div>
    </section>
    {view === 'review' && <p className="rounded-lg border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs leading-6 text-amber-900">审核预览包含尚未确认的知识内容。未经审核的节点与题目关联不会计入正式图谱；重要程度与考频尚未评定时保持空缺。</p>}
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<button type="button" onClick={reload} className="ml-4 underline">重试</button></div>}{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {!loading && !error && snapshot.nodes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center"><Layers3 className="mx-auto mb-4 text-indigo-400" /><h2 className="font-semibold">{view === 'approved' ? '正式图谱等待审核' : '知识库尚未初始化'}</h2><p className="mt-3 text-sm text-slate-500">{view === 'approved' ? '切换到审核预览，先查看知识体系，再逐项确认。' : '完成知识库初始化后，这里会展示高中数学知识体系。'}</p>{view === 'approved' && <button type="button" onClick={() => changeView('review')} className="mt-5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm text-white">查看审核预览</button>}</div> : <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-3">{loading ? <div role="status" className="grid h-[620px] place-items-center rounded-2xl bg-[#0b1427] text-sm text-slate-300">正在加载知识库…</div> : <Graph graph={visible} selected={selected} chapter={chapter} resetKey={resetKey} onSelect={choose} />}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[11px] text-slate-500"><span className="flex items-center gap-1.5"><CircleDot size={12} className="text-blue-500" />基础 / 未评级</span><span className="flex items-center gap-1.5"><CircleDot size={12} className="text-amber-500" />重点考点</span><span className="flex items-center gap-1.5"><CircleDot size={12} className="text-rose-500" />高频难点</span><label className="ml-auto flex items-center gap-2"><input type="checkbox" checked={crossLinks} onChange={e => setCrossLinks(e.target.checked)} />跨知识关系</label></div>
        <p className="text-[10px] text-slate-400">节点大小随已审核关联题数变化。紫色虚线表示前置知识，绿色箭头表示进阶方向，点线表示相关知识。</p>
        {chosen && (tree.children.get(chosen.id)?.length ?? 0) > 0 && <button type="button" onClick={() => setExpanded(old => { const next = new Set(old); if (next.has(chosen.id)) next.delete(chosen.id); else next.add(chosen.id); return next; })} className="text-xs text-indigo-600 hover:underline">{expanded.has(chosen.id) ? '收起' : '展开'}「{chosen.name}」的下一层</button>}
      </div>
      <NodeDetail key={chosen?.id + ':' + chosen?.updated_at} node={chosen} snapshot={snapshot} canReviewSeed={curator} busy={busy} onSelect={choose} onApprove={approve} />
    </div>}
  </div>;
}

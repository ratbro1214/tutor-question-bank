'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Scan, RotateCcw } from 'lucide-react';
import type { Graph as G6Graph, GraphData, IElementEvent } from '@antv/g6';
import { hierarchy, nodeColor, nodeSize, starPositions, type StarSnapshot } from '@/lib/knowledge_graph/star-map';

type Props = { graph: StarSnapshot; selected: string; chapter: string; resetKey: number; onSelect: (id: string) => void };
export function Graph({ graph, selected, chapter, resetKey, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null), instance = useRef<G6Graph | null>(null);
  const latest = useRef({ graph, selected, chapter, onSelect });
  const update = useRef<(() => void) | null>(null);
  const [error, setError] = useState(''), [ready, setReady] = useState(false);
  useEffect(() => { latest.current = { graph, selected, chapter, onSelect }; update.current?.(); }, [graph, selected, chapter, onSelect]);
  useEffect(() => {
    let disposed = false, observer: ResizeObserver | undefined;
    let graphInstance: G6Graph | undefined;
    const canvas = container.current;
    if (!canvas) return;
    let queue = Promise.resolve(), first = true, previousChapter = chapter, previousCount = 0;
    const dragged = new Map<string, [number, number]>();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fail = (e: unknown) => { if (!disposed) setError(e instanceof Error ? e.message : '图谱加载失败，请刷新重试。'); };
    void import('@antv/g6').then(({ Graph: GraphEngine, NodeEvent }) => {
      if (disposed) return;
      const g = new GraphEngine({ container: canvas, width: canvas.clientWidth, height: canvas.clientHeight,
        padding: [60, 85, 60, 85], animation: reduced ? false : { duration: 280 }, zoomRange: [0.15, 3],
        behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
        node: { type: 'circle', style: { cursor: 'pointer', labelFontFamily: 'Microsoft YaHei, sans-serif', labelFontSize: 12, labelFill: '#dbeafe', labelPlacement: 'bottom', labelOffsetY: 9, labelWordWrap: true, labelMaxWidth: 125, labelMaxLines: 2 },
          state: { selected: { stroke: '#fff', lineWidth: 3, halo: true, haloStroke: '#a5b4fc', haloLineWidth: 16, haloStrokeOpacity: 0.25, shadowColor: '#a5b4fc', shadowBlur: 24 }, active: { stroke: '#e0e7ff', lineWidth: 2, halo: true }, dim: { opacity: 0.18 } } },
        edge: { type: 'line', style: { stroke: '#3e557e', lineWidth: 1, opacity: 0.6 }, state: { active: { stroke: '#c4b5fd', lineWidth: 2, opacity: 1, shadowColor: '#a78bfa', shadowBlur: 8 }, dim: { opacity: 0.08 } } },
      });
      graphInstance = g; instance.current = g;
      const render = () => {
        queue = queue.then(async () => {
          if (disposed) return;
          const value = latest.current, positions = starPositions(value.graph, value.chapter);
          const changedChapter = previousChapter !== value.chapter;
          if (changedChapter) { dragged.clear(); previousChapter = value.chapter; }
          const data: GraphData = {
            nodes: value.graph.nodes.map(n => { const [x, y] = dragged.get(n.id) ?? positions.get(n.id) ?? [0, 0]; return { id: n.id, data: { label: n.name }, style: {
              x, y, size: nodeSize(n), fill: n.level === 1 ? '#7962db' : '#172b46', stroke: nodeColor(n), lineWidth: n.level < 3 ? 2 : 1.5,
              labelText: n.name, labelPlacement: n.level === 1 ? 'center' : 'bottom', labelFill: n.level === 1 ? '#fff' : '#dbeafe', labelFontSize: n.level === 1 ? 14 : 12,
              halo: n.level < 3, haloStroke: nodeColor(n), haloLineWidth: n.level === 1 ? 22 : 10, haloStrokeOpacity: 0.16,
              shadowColor: nodeColor(n), shadowBlur: n.level === 1 ? 24 : 12, shadowOffsetY: 0,
            } }; }),
            edges: value.graph.edges.map(e => ({ id: e.id, source: e.source_id, target: e.target_id, style: {
              stroke: e.relation_type === 'prerequisite' ? '#a78bfa' : e.relation_type === 'advanced' ? '#34d399' : '#45618d',
              lineDash: e.relation_type === 'related' ? [3, 5] : e.relation_type === 'prerequisite' ? [7, 4] : undefined,
              endArrow: ['prerequisite', 'advanced'].includes(e.relation_type),
            } })),
          };
          g.setData(data); await g.render();
          if (disposed) return;
          await g.setElementState(Object.fromEntries(value.graph.nodes.map(n => [n.id, n.id === value.selected ? ['selected'] : []])), false);
          if (first || changedChapter || previousCount !== value.graph.nodes.length) { await g.fitView(); first = false; }
          previousCount = value.graph.nodes.length;
          if (!disposed) setReady(true);
        }).catch(fail);
      };
      update.current = render;
      g.on(NodeEvent.CLICK, (event: IElementEvent) => { const id = event.target.id; if (id) latest.current.onSelect(id); });
      g.on(NodeEvent.DRAG_END, (event: IElementEvent) => { const id = event.target.id; if (id) { const p = g.getElementPosition(id); dragged.set(id, [p[0], p[1]]); } });
      const highlight = (id?: string) => {
        if (disposed) return;
        const value = latest.current, tree = hierarchy(value.graph), active = new Set(id ? tree.path(id) : []);
        if (id) for (const e of value.graph.edges) if (e.source_id === id || e.target_id === id) { active.add(e.source_id); active.add(e.target_id); }
        const states: Record<string, string[]> = {};
        for (const n of value.graph.nodes) states[n.id] = [...(n.id === value.selected ? ['selected'] : []), ...(id ? [active.has(n.id) ? 'active' : 'dim'] : [])];
        for (const e of value.graph.edges) states[e.id] = id ? [active.has(e.source_id) && active.has(e.target_id) ? 'active' : 'dim'] : [];
        queue = queue.then(async () => { if (!disposed) await g.setElementState(states, false); }).catch(fail);
      };
      g.on(NodeEvent.POINTER_ENTER, (event: IElementEvent) => highlight(event.target.id));
      g.on(NodeEvent.POINTER_LEAVE, () => highlight());
      observer = new ResizeObserver(() => { if (!disposed && canvas.clientWidth && canvas.clientHeight) g.resize(canvas.clientWidth, canvas.clientHeight); });
      observer.observe(canvas); render();
    }).catch(fail);
    return () => { disposed = true; observer?.disconnect(); update.current = null; instance.current = null; void queue.finally(() => graphInstance?.destroy()); };
    // A reset deliberately recreates the engine, clearing dragged positions and viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  const command = (action: 'in' | 'out' | 'fit') => { const g = instance.current; if (!g) return; void (action === 'fit' ? g.fitView() : g.zoomTo(g.getZoom() * (action === 'in' ? 1.25 : 0.8))).catch(() => setError('视图操作失败，请重置视图。')); };
  return <div className="atlas-surface relative h-[520px] min-w-0 overflow-hidden rounded-3xl border border-slate-700/40 bg-[#0b1427] sm:h-[690px]" style={{ backgroundImage: 'radial-gradient(ellipse at 50% 48%, #26345e80 0%, transparent 65%), radial-gradient(#7185b01f 1px, transparent 1px)', backgroundSize: '100% 100%, 26px 26px' }}>
    <div className="pointer-events-none absolute left-5 top-5 z-10"><p className="text-[10px] font-medium tracking-[0.24em] text-indigo-300/80">MATHEMATICS ATLAS</p><p className="mt-2 text-xs text-slate-400">{graph.nodes.length} 个可见节点 · {graph.edges.length} 条关系</p></div>
    <div ref={container} className="h-full w-full" role="img" aria-label="可交互数学知识星图。可用章节按钮、搜索及详情面板浏览同样的知识内容。" />
    {!ready && !error && <p role="status" className="absolute inset-0 grid place-items-center text-sm text-slate-300">正在绘制知识星图…</p>}
    {error && <p role="alert" className="absolute inset-x-6 top-20 rounded-xl bg-red-950/90 p-4 text-sm text-red-100">图谱渲染失败。请使用章节与搜索浏览，或重新加载页面。</p>}
    <div className="absolute bottom-5 left-5 text-[11px] leading-6 text-slate-400"><p>拖动节点与画布 · 滚轮缩放</p><p>点击节点查看详情并展开下一层</p></div>
    <div className="absolute bottom-5 right-5 flex overflow-hidden rounded-xl border border-white/10 bg-slate-800/65 backdrop-blur-xl text-slate-200">
      {[{ key: 'in', title: '放大', icon: Plus }, { key: 'out', title: '缩小', icon: Minus }, { key: 'fit', title: '适应画布', icon: Scan }].map(({ key, title, icon: Icon }) => <button key={key} type="button" title={title} aria-label={title} onClick={() => command(key as 'in' | 'out' | 'fit')} className="p-3 hover:bg-slate-700 disabled:opacity-40" disabled={!ready}><Icon size={16} /></button>)}
      <button type="button" title="重置缩放" aria-label="重置缩放" onClick={() => { void instance.current?.zoomTo(1); }} className="p-3 hover:bg-slate-700"><RotateCcw size={16} /></button>
    </div>
  </div>;
}

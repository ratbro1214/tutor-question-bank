'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Scan, LocateFixed } from 'lucide-react';
import type { Graph as G6Graph, GraphData, IElementEvent, IViewportEvent } from '@antv/g6';
import { hierarchy, nodeColor, nodeSize, starPositions, type StarSnapshot } from '@/lib/knowledge_graph/star-map';

type Props = { graph: StarSnapshot; selected: string; chapter: string; resetKey: number; onSelect: (id: string) => void };
export function Graph({ graph, selected, chapter, resetKey, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null), instance = useRef<G6Graph | null>(null);
  const latest = useRef({ graph, selected, chapter, onSelect });
  const update = useRef<(() => void) | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState(''), [ready, setReady] = useState(false);
  useEffect(() => { latest.current = { graph, selected, chapter, onSelect }; update.current?.(); }, [graph, selected, chapter, onSelect]);
  useEffect(() => {
    let disposed = false, observer: ResizeObserver | undefined;
    let graphInstance: G6Graph | undefined;
    const canvas = container.current;
    if (!canvas) return;
    let queue = Promise.resolve(), first = true, previousChapter = chapter, previousSelected = '', previousNodes = '';
    const dragged = new Map<string, [number, number]>();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fail = (e: unknown) => { if (!disposed) setError(e instanceof Error ? e.message : '图谱加载失败，请刷新重试。'); };
    void import('@antv/g6').then(({ Graph: GraphEngine, NodeEvent, GraphEvent }) => {
      if (disposed) return;
      const g = new GraphEngine({ container: canvas, width: canvas.clientWidth, height: canvas.clientHeight,
        padding: [85, 110, 90, 80], animation: false, zoomRange: [0.2, 2.5],
        behaviors: ['drag-canvas', { type: 'zoom-canvas', sensitivity: 0.65 }, 'drag-element',
          { type: 'fix-element-size', enable: true, state: '', node: { shape: 'label' }, edgeFilter: () => false, comboFilter: () => false }],
        node: { type: 'circle', style: datum => ({ cursor: 'pointer', labelFontFamily: 'Microsoft YaHei, sans-serif', labelFontSize: 13, labelFill: '#e2e8f0', labelPlacement: 'bottom', labelOffsetY: 12, labelWordWrap: true, labelMaxWidth: 158, labelMaxLines: 2, labelBackground: true, labelBackgroundFill: '#101d33', labelBackgroundRadius: 5, labelPadding: [4, 6], ...datum.style }),
          state: { selected: { stroke: '#fff', lineWidth: 3, labelFill: '#fff', labelFontWeight: 600, halo: true, haloStroke: '#a5b4fc', haloLineWidth: 12, haloStrokeOpacity: 0.3 }, active: { stroke: '#e0e7ff', lineWidth: 2, halo: true }, dim: { opacity: 0.6 } } },
        edge: { type: datum => String(datum.type ?? 'line'), style: datum => ({ stroke: '#647fa8', lineWidth: 1.2, opacity: 0.7, ...datum.style }), state: { active: { stroke: '#c4b5fd', lineWidth: 2, opacity: 1 }, dim: { opacity: 0.28 } } },
      });
      graphInstance = g; instance.current = g;
      const render = () => {
        queue = queue.then(async () => {
          if (disposed) return;
          const value = latest.current, positions = starPositions(value.graph, value.chapter);
          const changedChapter = previousChapter !== value.chapter;
          const nodeIds = value.graph.nodes.map(n => n.id).sort().join('|');
          const changedNodes = previousNodes !== nodeIds;
          if (changedChapter) { dragged.clear(); previousChapter = value.chapter; }
          const data: GraphData = {
            nodes: value.graph.nodes.map(n => { const [x, y] = dragged.get(n.id) ?? positions.get(n.id) ?? [0, 0]; return { id: n.id, data: { label: n.name }, style: {
              x, y, size: nodeSize(n), fill: n.level === 1 ? '#7962db' : '#172b46', stroke: nodeColor(n), lineWidth: n.level < 3 ? 2 : 1.5,
              labelText: n.name, labelPlacement: value.chapter ? 'right' : 'bottom', labelOffsetX: value.chapter ? 12 : 0, labelOffsetY: value.chapter ? 0 : 12, labelFill: '#e2e8f0', labelFontSize: n.level <= 2 ? 14 : 13,
              halo: n.level < 3, haloStroke: nodeColor(n), haloLineWidth: n.level === 1 ? 22 : 10, haloStrokeOpacity: 0.16,
              shadowColor: nodeColor(n), shadowBlur: n.level === 1 ? 12 : 4, shadowOffsetY: 0,
            } }; }),
            edges: value.graph.edges.map(e => ({ id: e.id, source: e.source_id, target: e.target_id, type: value.chapter && ['contains', 'belongs_to'].includes(e.relation_type) ? 'cubic-horizontal' : 'line', style: {
              stroke: e.relation_type === 'prerequisite' ? '#a78bfa' : e.relation_type === 'advanced' ? '#34d399' : '#45618d',
              lineDash: e.relation_type === 'related' ? [3, 5] : e.relation_type === 'prerequisite' ? [7, 4] : undefined,
              endArrow: ['prerequisite', 'advanced'].includes(e.relation_type),
            } })),
          };
          g.setData(data); await g.render();
          if (disposed) return;
          await g.setElementState(Object.fromEntries([
            ...value.graph.nodes.map(n => [n.id, n.id === value.selected ? ['selected'] : []]),
            ...value.graph.edges.map(e => [e.id, []]),
          ]), false);
          // Fit on entering a chapter only. Expanding a branch must not shrink the whole map.
          if (first || changedChapter) {
            if (value.graph.nodes.length) {
              await g.fitView({}, false);
              if (g.getZoom() < 0.65) { await g.zoomTo(0.65, false); if (value.selected) await g.focusElement(value.selected, false); }
            }
            first = false;
          } else if ((changedNodes || previousSelected !== value.selected) && value.selected) {
            await g.focusElement(value.selected, reduced ? false : { duration: 220 });
          }
          previousNodes = nodeIds; previousSelected = value.selected; setZoom(g.getZoom());
          if (!disposed) setReady(true);
        }).catch(fail);
      };
      update.current = render;
      g.on(GraphEvent.AFTER_TRANSFORM, (event: IViewportEvent) => { if (!disposed && typeof event.data.scale === 'number') setZoom(event.data.scale); });
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
      observer = new ResizeObserver(() => {
        if (disposed || !canvas.clientWidth || !canvas.clientHeight) return;
        g.resize(canvas.clientWidth, canvas.clientHeight);
        // Keep the current knowledge point in view when entering/leaving the large workspace.
        if (!first) queue = queue.then(async () => { if (!disposed && latest.current.selected) await g.focusElement(latest.current.selected, false); }).catch(fail);
      });
      observer.observe(canvas); render();
    }).catch(fail);
    return () => { disposed = true; observer?.disconnect(); update.current = null; instance.current = null; void queue.finally(() => graphInstance?.destroy()); };
    // A reset deliberately recreates the engine, clearing dragged positions and viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  const command = async (action: 'in' | 'out' | 'fit' | 'focus' | 'actual') => {
    const g = instance.current; if (!g) return;
    try {
      if (action === 'fit') await g.fitView();
      else if (action === 'focus') { if (selected) await g.focusElement(selected); }
      else { await g.zoomTo(action === 'actual' ? 1 : Math.min(2.5, Math.max(0.2, g.getZoom() * (action === 'in' ? 1.25 : 0.8)))); if (action === 'actual' && selected) await g.focusElement(selected); }
    } catch { setError('视图操作失败，请重置视图。'); }
  };
  return <div className="atlas-surface relative h-[540px] min-w-0 overflow-hidden rounded-2xl border border-slate-700/60 bg-[#0b1427] sm:h-[clamp(540px,70vh,820px)] [[data-immersive=true]_&]:h-full" style={{ backgroundImage: 'radial-gradient(ellipse at 40% 45%, #26345e60 0%, transparent 70%), radial-gradient(#7185b01f 1px, transparent 1px)', backgroundSize: '100% 100%, 26px 26px' }}>
    <div className="pointer-events-none absolute left-5 top-5 z-10 rounded-xl border border-white/5 bg-[#0b1427]/85 px-4 py-3 backdrop-blur"><p className="text-[10px] font-medium tracking-[0.24em] text-indigo-300/80">MATHEMATICS ATLAS</p><p className="mt-2 text-xs text-slate-300">{chapter ? '章节探索' : '学科总览'}<span className="mx-2 text-slate-600">/</span>{graph.nodes.length} 节点 · {graph.edges.length} 关系</p></div>
    <div ref={container} className="h-full w-full" role="img" aria-label="可交互数学知识星图。可用章节按钮、搜索及详情面板浏览同样的知识内容。" />
    {!ready && !error && <p role="status" className="absolute inset-0 grid place-items-center text-sm text-slate-300">正在绘制知识星图…</p>}
    {error && <p role="alert" className="absolute inset-x-6 top-20 rounded-xl bg-red-950/90 p-4 text-sm text-red-100">图谱渲染失败。请使用章节与搜索浏览，或重新加载页面。</p>}
    <div className="pointer-events-none absolute bottom-20 left-5 text-[11px] leading-6 text-slate-400 sm:bottom-5"><p>拖动画布移动 · 滚轮缩放</p><p className="hidden sm:block">点击节点探索下一层 · 文字保持清晰</p></div>
    <div className="absolute bottom-5 right-5 flex items-center overflow-hidden rounded-xl border border-white/15 bg-slate-800/90 text-slate-200 shadow-xl backdrop-blur-xl">
      {[{ key: 'in', title: '放大', icon: Plus }, { key: 'out', title: '缩小', icon: Minus }, { key: 'fit', title: '适应画布', icon: Scan }].map(({ key, title, icon: Icon }) => <button key={key} type="button" title={title} aria-label={title} onClick={() => command(key as 'in' | 'out' | 'fit')} className="p-3 hover:bg-slate-700 disabled:opacity-40" disabled={!ready}><Icon size={16} /></button>)}
      <button type="button" title="原始比例并定位当前节点" aria-label="原始比例并定位当前节点" disabled={!ready} onClick={() => void command('actual')} className="min-w-16 border-x border-white/10 px-3 py-3 text-xs tabular-nums hover:bg-slate-700 disabled:opacity-40">{Math.round(zoom * 100)}%</button>
      <button type="button" title="定位当前节点" aria-label="定位当前节点" disabled={!ready || !selected} onClick={() => void command('focus')} className="p-3 hover:bg-slate-700 disabled:opacity-40"><LocateFixed size={16} /></button>
    </div>
  </div>;
}

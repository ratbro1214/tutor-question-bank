'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, Check, CircleDot, Layers3 } from 'lucide-react';
import { hierarchy, levelLabels, relationLabels, type StarNode, type StarSnapshot } from '@/lib/knowledge_graph/star-map';

type Props = { node: StarNode | undefined; snapshot: StarSnapshot; canReviewSeed: boolean; busy: boolean; onSelect: (id: string) => void; onApprove: (node: StarNode, parentId?: string) => Promise<void> };
export function NodeDetail({ node, snapshot, canReviewSeed, busy, onSelect, onApprove }: Props) {
  const [confirmed, setConfirmed] = useState(false), [parentChoice, setParentChoice] = useState('');
  const tree = hierarchy(snapshot);
  if (!node) return <aside className="rounded-2xl border border-slate-200 bg-white p-6"><CircleDot className="mb-4 text-indigo-500" /><h2 className="font-semibold text-slate-900">探索一个知识点</h2><p className="mt-3 text-sm leading-7 text-slate-500">点击星图节点，查看知识内容、相关考点、典型题型与题库关联。</p></aside>;
  const path = tree.path(node.id).map(id => tree.byId.get(id)!), chapter = path.find(n => n.level === 2);
  const descendants = snapshot.nodes.filter(n => n.id !== node.id && tree.path(n.id).includes(node.id));
  const examPoints = descendants.filter(n => n.level === 4), taskTypes = descendants.filter(n => n.level === 5);
  const children = (tree.children.get(node.id) ?? []).map(id => tree.byId.get(id)!);
  const related = snapshot.edges.filter(e => !['belongs_to', 'contains'].includes(e.relation_type) && (e.source_id === node.id || e.target_id === node.id));
  const parent = tree.byId.get(parentChoice || tree.parent.get(node.id) || '');
  const canApprove = node.source !== 'seed' || canReviewSeed;
  const parentReady = node.level === 1 || parent?.knowledge_review_status === 'approved';
  const list = (items: StarNode[]) => <div className="space-y-1">{items.map(n => <button key={n.id} type="button" onClick={() => onSelect(n.id)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left text-sm leading-5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"><span>{n.name}</span><ChevronRight size={13} className="shrink-0" /></button>)}</div>;
  return <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white lg:max-h-[690px] lg:overflow-y-auto" aria-label="知识节点详情">
    <div className="border-b border-slate-100 p-5">
      <div className="flex items-center justify-between gap-2 text-[11px]"><span className="font-medium tracking-wide text-indigo-600">{levelLabels[node.level]}</span><span className={`rounded-full px-2 py-1 ${node.knowledge_review_status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{node.knowledge_review_status === 'approved' ? '已审核' : '待审核'}</span></div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{node.name}</h2><p className="mt-2 text-xs text-slate-500">所属章节 · {chapter?.name ?? (node.level === 1 ? '全部章节' : '尚未归属')}</p>
      <p className="mt-5 text-sm leading-7 text-slate-600">{node.description}</p>
      <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">本节点关联题目</p><p className="mt-1 text-2xl font-semibold text-slate-900">{node.question_count}<span className="ml-1 text-xs font-normal text-slate-500">题</span></p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">高考重要程度</p><p className="mt-2 text-sm font-medium text-slate-700">{node.importance === 'high' ? '重点' : node.importance === 'medium' ? '重要' : node.importance === 'low' ? '一般' : '待评定'}</p></div></div>
      <p className="mt-3 text-[10px] leading-5 text-slate-400">题数仅统计你有权限查看、当前版本已审核的直接关联。考频：{node.exam_frequency === 'high' ? '高' : node.exam_frequency === 'medium' ? '中' : node.exam_frequency === 'low' ? '低' : '暂无统计'}。</p>
    </div>
    <div className="space-y-5 p-5">
      <Link className="block rounded-lg border border-indigo-100 p-3 text-sm text-indigo-700" href={'/math-methods?code='+encodeURIComponent(node.code)}>查找关联策略、边界与替代方法 →</Link>
      {path.length > 1 && <div><h3 className="mb-2 text-xs font-semibold text-slate-500">知识路径</h3><div className="flex flex-wrap items-center gap-1 text-xs leading-6">{path.slice(0, -1).map(n => <button key={n.id} type="button" onClick={() => onSelect(n.id)} className="text-indigo-600 hover:underline">{n.name} /</button>)}<span className="text-slate-500">{node.name}</span></div></div>}
      {!!children.length && node.level !== 3 && <section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Layers3 size={15} className="text-indigo-500" />下一层知识 <span className="text-xs font-normal text-slate-400">{children.length}</span></h3>{list(children)}</section>}
      {node.level === 3 && <section><h3 className="mb-2 text-sm font-semibold">相关考点</h3>{examPoints.length ? list(examPoints) : <p className="text-xs text-slate-500">暂无考点记录</p>}</section>}
      {node.level >= 3 && node.level < 5 && <section><h3 className="mb-2 text-sm font-semibold">典型题型</h3>{taskTypes.length ? list(taskTypes) : <p className="text-xs text-slate-500">暂无题型记录</p>}</section>}
      {!!related.length && <section><h3 className="mb-2 text-sm font-semibold">跨知识关联</h3>{related.map(e => { const target = tree.byId.get(e.source_id === node.id ? e.target_id : e.source_id); return target && <button key={e.id} type="button" onClick={() => onSelect(target.id)} className="my-1 flex w-full items-center justify-between gap-2 rounded-lg bg-indigo-50/60 p-3 text-left text-xs text-indigo-800"><span><span className="mb-1 block text-[10px] text-indigo-500">{e.relation_type === 'prerequisite' && e.target_id === node.id ? '后续依赖此知识' : relationLabels[e.relation_type]}</span>{target.name}</span><ArrowUpRight size={14} /></button>; })}</section>}
      {node.knowledge_review_status === 'pending' && canApprove && <section className="space-y-3 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold">教师审核</h3>
        {node.level > 1 && !tree.parent.has(node.id) && <label className="block text-xs text-slate-500">选择上级节点<select value={parentChoice} onChange={e => setParentChoice(e.target.value)} className="mt-2 w-full rounded-lg border p-2 text-sm"><option value="">请选择已审核上级</option>{snapshot.nodes.filter(n => n.level === node.level - 1 && n.knowledge_review_status === 'approved').map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>}
        {!parentReady && <p className="text-xs leading-6 text-amber-700">请先审核上级知识，再确认此节点。</p>}
        <label className="flex items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />我已核对名称、内容及所属层级</label>
        <button type="button" disabled={busy || !confirmed || !parentReady} onClick={() => { void onApprove(node, parentChoice || undefined); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-40"><Check size={15} />{busy ? '正在保存…' : '确认审核'}</button>
      </section>}
    </div>
  </aside>;
}

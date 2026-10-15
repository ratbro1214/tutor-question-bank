'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MathText } from './math-text';
import type { MethodStrategy } from '@/lib/method-strategy-schema';
import type { GraphMethod } from '@/lib/knowledge-graph';
import { strategyLinkLabels } from '@/lib/method-strategy-schema';
import { methodNetwork, methodNeighborhood } from '@/lib/method-network';

export function MethodStrategyDetails({ strategy: s }: { strategy: MethodStrategy }) {
  const [audience, setAudience] = useState<'student' | 'teacher'>('student');
  return <div className="space-y-5 rounded-xl border border-indigo-100 p-4">
    <div className="flex flex-wrap items-center gap-3"><b>策略 2.0 · {s.parent} · 难度 {s.difficulty}/5</b><button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setAudience(v => v === 'student' ? 'teacher' : 'student')}>{audience === 'student' ? '查看教师拓展' : '查看高考书写'}</button></div>
    <section><h3 className="font-semibold">结构识别依据</h3>{s.structure.map((v,i) => <MathText key={i}>{v}</MathText>)}</section>
    <section><h3 className="font-semibold">为什么在这里分类？</h3>{s.criticalMechanisms.map((c,i) => <div key={i} className="my-2 rounded-lg bg-amber-50 p-3"><b>{c.event}</b><MathText>{c.equation}</MathText><MathText>{c.consequence}</MathText></div>)}</section>
    <section><h3 className="font-semibold">必须检查</h3>{s.checks.map((v,i) => <MathText key={i}>{v}</MathText>)}</section>
    <section><h3 className="font-semibold">更简洁的依据与替代方法</h3><MathText>{s.whySimpler}</MathText>{s.alternatives.map(a => <p key={a.name} className="text-sm">{a.name}：{a.advantage} {a.cost}</p>)}</section>
    <section><h3 className="font-semibold">{audience === 'student' ? '高考标准书写流程（需结合题目）' : '教师拓展说明'}</h3>{(audience === 'student' ? s.standardSolution : s.teacherNotes).map((v,i) => <MathText key={i}>{`${i+1}. ${v}`}</MathText>)}</section>
    {s.examples.map((e,i) => <section key={i}><h3 className="font-semibold">教学例题 · 随卡待审核</h3><MathText>{e.statement}</MathText><MathText>{e.solution}</MathText></section>)}
    <div className="text-sm"><p>关联知识 / 前置依据：{s.knowledgeCodes.join('、')}</p><div className="flex flex-wrap gap-2">{s.catalogCodes.map(code => <Link key={code} className="underline" href={'/knowledge-graph/star-map?code='+encodeURIComponent(code)}>在知识星图定位 {code} →</Link>)}</div><p className="text-xs text-slate-500">知识适用映射与方法关系随卡审核；图谱正式可见性仍由节点及关联的审核状态决定。</p></div>
  </div>;
}

export function MethodNetwork({ methods, selected, onSelect }: { methods: GraphMethod[]; selected: GraphMethod | null; onSelect: (m: GraphMethod) => void }) {
  const [query,setQuery] = useState(''), [family,setFamily] = useState(''), [approved,setApproved] = useState(false), [expanded,setExpanded] = useState<string[]>([]), [compare,setCompare] = useState<string[]>([]);
  const all = methodNetwork(methods, approved);
  const found = all.nodes.filter(m => (!family || m.content.strategy!.family === family) && (!query || JSON.stringify(m.content).toLowerCase().includes(query.toLowerCase())));
  const center = found.find(m => m.id === selected?.id) || found[0];
  const graph = center ? methodNeighborhood(all.nodes, center.id, expanded, approved) : { nodes: [], edges: [] };
  const nodes = graph.nodes.filter(m => found.includes(m)), ids = new Set(nodes.map(n => n.id));
  const chosen = all.nodes.filter(m => compare.includes(m.id));
  return <section className="space-y-3 rounded-2xl border bg-white p-5" aria-label="交互方法网络"><h2 className="font-semibold">方法网络 · 母方法 → 策略 → 边界与替代</h2>
    <div className="flex flex-wrap gap-2"><input aria-label="搜索方法网络" className="rounded border p-2 text-sm" placeholder="搜索并定位方法或知识编码" value={query} onChange={e => { setQuery(e.target.value); setExpanded([]); }} /><select aria-label="方法专题" className="rounded border p-2 text-sm" value={family} onChange={e => { setFamily(e.target.value); setExpanded([]); }}><option value="">全部专题</option><option value="parameter">参数讨论</option><option value="inequality">基本不等式</option></select><label className="p-2 text-sm"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} /> 仅已审核网络</label><button className="rounded border px-3 text-sm" onClick={() => setExpanded([])}>折叠邻居</button></div>
    <div className="flex flex-wrap gap-2">{found.slice(0,30).map(m => <button className={'rounded-full border px-3 py-1 text-xs '+(m.id === center?.id ? 'bg-indigo-100' : '')} key={m.id} onClick={() => { setExpanded([]); onSelect(m); }}>{m.content.name}</button>)}</div>
    <p className="text-xs text-slate-500">点击节点定位详情；展开相邻策略，最多显示24个节点。候选关系为虚线，双方已审核才显示为正式关系。当前匹配 {found.length} 个策略。</p>
    {!nodes.length ? <p className="text-sm text-amber-700">暂无符合筛选的策略。先导入候选卡，或完成审核。</p> : <div className="overflow-x-auto"><svg viewBox={`0 0 760 ${Math.ceil(nodes.length/3)*100+30}`} className="min-w-[640px] w-full" role="group" aria-label="可选择的方法关系图">
      {graph.edges.filter(e => ids.has(e.from) && ids.has(e.to)).map((e,i) => { const a=nodes.findIndex(n=>n.id===e.from), b=nodes.findIndex(n=>n.id===e.to); return <line key={i} x1={(a%3)*250+125} y1={Math.floor(a/3)*100+45} x2={(b%3)*250+125} y2={Math.floor(b/3)*100+45} stroke={e.type === 'boundary' ? '#d97706' : '#a5b4fc'} strokeDasharray={e.reviewed ? undefined : '5 5'}><title>{strategyLinkLabels[e.type]}：{e.reason}</title></line>; })}
      {nodes.map((m,i) => <g key={m.id} transform={`translate(${(i%3)*250+10},${Math.floor(i/3)*100+15})`} role="button" tabIndex={0} aria-label={'定位 '+m.content.name} onClick={() => onSelect(m)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(m); } }} className="cursor-pointer"><rect width="230" height="65" rx="12" fill={m.id===center?.id?'#e0e7ff':'#fff'} stroke={m.status==='approved'?'#6366f1':'#d97706'} /><text x="12" y="26" fontSize="13">{m.content.name}</text><text x="12" y="47" fontSize="10" fill="#64748b">{m.content.strategy!.parent} · {m.status==='approved'?'已审核':'待审核'}</text></g>)}
    </svg></div>}
    {center && <div className="space-y-2"><button className="rounded border px-3 py-2 text-sm" onClick={() => setExpanded(old => [...new Set([...old, ...nodes.map(n=>n.id)])].slice(0,24))}>展开当前节点的下一层邻居</button>{graph.edges.filter(e => ids.has(e.from) && ids.has(e.to)).map((e,i) => <p className="text-xs text-slate-600" key={i}>{all.nodes.find(n=>n.id===e.from)?.content.name} → {strategyLinkLabels[e.type]} → {all.nodes.find(n=>n.id===e.to)?.content.name}（{e.reviewed?'已审核':'待审核'}）</p>)}</div>}
    <div className="flex flex-wrap gap-2">{found.map(m => <label key={m.id} className="text-xs"><input type="checkbox" checked={compare.includes(m.id)} disabled={!compare.includes(m.id)&&compare.length>=2} onChange={e => setCompare(old => e.target.checked ? [...old,m.id] : old.filter(id=>id!==m.id))} />比较 {m.content.name}</label>)}</div>
    {chosen.length>0 && <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><caption>最多比较两种策略 · 条件、代价与边界</caption><thead><tr><th className="border p-2">比较项</th>{chosen.map(m=><th key={m.id} className="border p-2">{m.content.name}</th>)}</tr></thead><tbody>{['适用条件','必须检查','为何优先简法','替代方法'].map((label,i)=><tr key={label}><th className="border p-2">{label}</th>{chosen.map(m=><td className="border p-2" key={m.id}>{[m.content.conditions.join('；'),m.content.strategy!.checks.join('；'),m.content.strategy!.whySimpler,m.content.strategy!.alternatives.map(a=>a.name+'：'+a.cost).join('；')][i]}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}

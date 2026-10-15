'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MathText } from './math-text';
import { graphRequest, graphButton } from './knowledge-methods';
import { decisionFactsSchema, type DecisionFacts, type StrategyDecision as Decision } from '@/lib/strategy-decision';

const fields = [
  ['domain','定义域',[['unknown','待确认'],['checked','已核对全部限制']]],
  ['degeneration','次数与退化',[['unknown','待确认'],['checked','已单列退化情形']]],
  ['separable','能否等价分离参数',[['unknown','待确认'],['yes','可以'],['no','不能直接分离']]],
  ['divisor','分离时除数符号',[['unknown','待确认'],['positive','恒正'],['negative','恒负'],['changes','变号'],['zero','可能为零']]],
  ['quantifier','量词',[['unknown','待确认'],['all','对所有变量成立'],['exists','存在变量成立']]],
  ['bound','分离后的参数方向',[['unknown','待确认'],['upper','a ≤ g(x)（上界）'],['lower','a ≥ g(x)（下界）']]],
  ['objective','参数求解目标',[['unknown','待确认'],['maximum','最大参数'],['minimum','最小参数'],['range','完整参数范围']]],
  ['positive','基本不等式的项',[['unknown','待确认'],['yes','已确认全部为正'],['no','并非正项']]],
  ['equality','等号是否可达',[['unknown','待确认'],['reachable','已确认同时可达'],['unreachable','不可达']]],
  ['structure','已确认的主要结构',[['unknown','待判断'],['fixedSum','定和求积'],['fixedProduct','定积求和'],['reciprocal','倒数配凑'],['square','作差或配方'],['derivative','一元函数与导数']]],
] as const;
export function StrategyDecisionPanel({ scopeId, canonicalId }: { scopeId?: string; canonicalId?: string }) {
  const [open,setOpen]=useState(false), [text,setText]=useState(''), [facts,setFacts]=useState<DecisionFacts>(()=>decisionFactsSchema.parse({})), [data,setData]=useState<Decision|null>(null), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const invalidate = () => { controller.current?.abort(); setData(null); setBusy(false); };
  async function run() {
    controller.current?.abort(); const c=new AbortController();controller.current=c;setBusy(true);setError('');setData(null);
    try { const result=await graphRequest<Decision>('/strategies',{action:'decide',...(canonicalId?{canonicalId}:{scopeId,text}),facts},'POST',c.signal);if(!c.signal.aborted)setData(result); }
    catch(e){if(!c.signal.aborted)setError((e as Error).message);}finally{if(!c.signal.aborted)setBusy(false);}
  }
  return <section className="space-y-4 rounded-xl border border-indigo-100 bg-white p-4"><button type="button" className={graphButton} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>解题策略建议{open?'收起':'展开'}</button>{open&&<>
    <p className="text-sm text-slate-500">确认已知条件，未知项可保留。{canonicalId?'分析当前题目。':'粘贴题干或输入如“含参函数恒成立问题”。'}</p>
    {!canonicalId&&<textarea aria-label="策略分析题干" className="w-full rounded border p-3 text-sm" rows={3} value={text} onChange={e=>{invalidate();setText(e.target.value);}} />}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([key,label,options])=><label className="text-xs text-slate-600" key={key}>{label}<select className="mt-1 w-full rounded border p-2 text-sm" value={facts[key]} onChange={e=>{invalidate();setFacts(v=>({...v,[key]:e.target.value}));}}>{options.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>)}</div>
    <button className={graphButton} disabled={busy||(!canonicalId&&(!scopeId||!text.trim()))} onClick={()=>void run()}>{busy?'正在分析…':'生成可解释策略建议'}</button>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {data&&<><p className="text-xs text-amber-800">{data.notice}</p><ol className="list-decimal space-y-2 pl-5 text-sm">{data.trace.map((v,i)=><li key={i}>{v}</li>)}</ol>
      <div className="rounded bg-amber-50 p-3"><h3 className="font-semibold">边界与常见失效原因</h3>{[...data.checks,...data.risks].map((v,i)=><MathText key={i}>{v}</MathText>)}</div>
      {!data.items.length&&<p className="text-sm">当前无可用策略，请先在方法库导入核心候选卡，或人工选择方法。</p>}
      {data.items.map(item=><article className="space-y-3 rounded-lg border p-4" key={item.id}><h3 className="font-semibold">{item.name} · {item.verdict==='preferred'?'条件匹配，优先核验':item.verdict==='alternative'?'备选':'待核验路径'} · {item.status==='approved'?'卡片已审核':'卡片待审核'}</h3><MathText>{item.reason}</MathText><MathText>{'适用条件：'+item.conditions.join('；')}</MathText><MathText>{'为什么可选更简洁的方法：'+item.whySimpler}</MathText>{item.mechanisms.map((m,i)=><MathText key={i}>{`${m.event}：${m.equation} → ${m.consequence}`}</MathText>)}<details><summary className="cursor-pointer text-sm">规范书写、替代方法、前置知识与迁移</summary><div className="mt-2 space-y-2">{item.standardSolution.map((s,i)=><MathText key={i}>{s}</MathText>)}{item.alternatives.map(a=><MathText key={a.name}>{a.name+'：'+a.advantage+'；'+a.cost}</MathText>)}<p className="text-xs">知识编码：{item.prerequisites.join('、')}</p>{item.transfer.map((s,i)=><MathText key={i}>{s}</MathText>)}</div></details><Link className="text-sm underline" href={'/math-methods?method='+encodeURIComponent(item.id)}>查看方法网络与审核 →</Link></article>)}
      <p className="text-xs text-slate-500">建议仅供参考，题目关联需在方法卡中确认。</p>
    </>}
  </>}</section>;
}

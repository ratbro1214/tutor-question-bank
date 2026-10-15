'use client';
import { useEffect, useRef, useState } from 'react';
import { graphRequest, graphButton } from './knowledge-methods';
type Plan = { provenance: string; missingKnowledgeCodes: string[]; plan: { key: string; name: string; action: 'insert'|'preserve'; existingIds: string[]; legacy: { id: string; name: string }[]; similar: { id: string; name: string }[] }[]; inserted: number; preserved: number; relationsInserted: number };
export function StrategyImport({ scopeId, onImported }: { scopeId: string; onImported: () => void }) {
  const [plan,setPlan]=useState<Plan|null>(null), [busy,setBusy]=useState(false), [error,setError]=useState(''), [done,setDone]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function run(action: 'preview'|'import') {
    const c=new AbortController();controller.current=c;setBusy(true);setError('');
    try { const d=await graphRequest<Plan>('/strategies',{action,scopeId},'POST',c.signal);if(c.signal.aborted)return;setPlan(d);if(action==='import'){setDone(`新增 ${d.inserted} 张，保留 ${d.preserved} 张；新增 ${d.relationsInserted} 条待审核知识适用关系。`);onImported();} }
    catch(e){if(!c.signal.aborted)setError((e as Error).message);}finally{if(!c.signal.aborted)setBusy(false);}
  }
  return <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-semibold">核心策略卡</h2><p className="text-xs text-slate-500">23 张策略卡，导入后待审核；已有内容不会被覆盖。</p><button className={graphButton} disabled={!scopeId||busy} onClick={()=>void run('preview')}>校验并预览导入</button>
    {plan&&<><p className="text-xs">{plan.provenance}</p>{plan.missingKnowledgeCodes.length>0&&<p className="text-xs text-amber-800">旧知识表尚缺编码 {plan.missingKnowledgeCodes.join('、')}，相关知识关联暂未建立。</p>}<details><summary className="cursor-pointer text-sm">查看 {plan.plan.length} 张卡的去重与映射</summary><div className="max-h-64 overflow-auto">{plan.plan.map(p=><p key={p.key} className="border-b py-2 text-xs">{p.name} · {p.action==='insert'?'新增待审核':'保留已有卡'}{p.legacy.length>0?' · 母方法旧卡：'+p.legacy.map(m=>m.name).join('、'):''}{p.similar.length>0?' · 相似建议：'+p.similar.slice(0,2).map(m=>m.name).join('、'):''}</p>)}</div></details><button className={graphButton} disabled={busy} onClick={()=>void run('import')}>导入核心候选卡</button></>}{done&&<p role="status" className="text-sm text-emerald-800">{done}</p>}{error&&<p role="alert" className="text-sm text-red-700">{error} 已完成的卡片保留，重试会跳过已有卡。</p>}
  </section>;
}

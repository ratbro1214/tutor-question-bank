import { MathText } from './math-text';
import type { MethodContent } from '@/lib/knowledge-graph';

export const methodListFields = { signals: '识别信号', formulas: '核心公式', knowledgePoints: '知识点', strategies: '解题策略', problemTypes: '题目类型' } as const;
export const methodTextFields = { motivation: '为什么想到这个方法？', efficiency: '计算效率与通用性', teachingValue: '教学价值' } as const;
export function MethodThinking({ content: c }: { content: MethodContent }) {
  return <div className="min-w-0 space-y-6 font-sans text-base leading-8 text-slate-700">
    <section className="min-w-0 rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5"><h3 className="mb-4 text-base font-semibold text-slate-900">识别信号</h3>{c.signals?.length ? <ol className="list-outside list-decimal space-y-3 pl-6 marker:text-blue-500">{c.signals.map((s, i) => <li key={i} className="min-w-0 pl-1"><MathText>{s}</MathText></li>)}</ol> : <p className="text-sm text-slate-500">待补充：题目出现哪些特征时可以考虑本方法。</p>}</section>
    <section className="min-w-0 rounded-xl border border-orange-100 bg-orange-50/40 p-4 sm:p-5"><h3 className="mb-4 text-base font-semibold text-slate-900">为什么想到这个方法？</h3><MathText>{c.motivation || '待补充：从题目特征到方法选择的推理。'}</MathText></section>
    {(Object.keys(methodListFields) as (keyof typeof methodListFields)[]).filter(k => k !== 'signals' && c[k]?.length).map(k => <section key={k}><h3 className="mb-3 font-semibold text-slate-900">{methodListFields[k]}</h3><ul className="list-outside list-disc space-y-3 pl-6 marker:text-slate-400">{c[k]?.map((s,i) => <li key={i} className="min-w-0 pl-1"><MathText>{s}</MathText></li>)}</ul></section>)}
    {(['efficiency', 'teachingValue'] as const).filter(k => c[k]).map(k => <section key={k}><h3 className="mb-3 font-semibold text-slate-900">{methodTextFields[k]}</h3><MathText>{c[k]!}</MathText></section>)}
  </div>;
}

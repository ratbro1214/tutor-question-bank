"use client";
import { useEffect, useRef, useState } from 'react';
import type { MethodContent } from '@/lib/knowledge-graph';
import { methodCompletionSchema, missingThinking, type MethodCompletion } from '@/lib/method-completion';
import { MathText } from './math-text';

type Result = { suggestion: MethodCompletion; model: string; promptVersion: string };
const field = 'block min-h-36 w-full resize-y rounded-lg border border-slate-200 bg-white p-4 font-sans text-base leading-8 text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100';
function SuggestionField({ title, value, onChange, list = false }: { title: string; value: string; onChange: (value: string) => void; list?: boolean }) {
  const [editing, setEditing] = useState(false);
  return <section className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium text-slate-800">{title}</h4><button type="button" className="rounded-md border border-violet-200 bg-white px-3 py-1.5 text-sm text-violet-800" aria-pressed={editing} onClick={() => setEditing(v => !v)}>{editing ? '预览排版' : '编辑原文'}</button></div>
    {editing ? <><textarea aria-label={title} className={field} rows={list ? 6 : 9} spellCheck={false} value={value} onChange={e => onChange(e.target.value)} /><p className="text-xs leading-6 text-slate-500">编辑时显示公式源码，切换“预览排版”查看效果。{list && '识别信号每行一条。'}</p></> : <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 font-sans text-base leading-8 text-slate-700">{list ? <ol className="list-outside list-decimal space-y-3 pl-6 marker:text-violet-500">{value.split('\n').filter(s => s.trim()).map((line, index) => <li key={index} className="min-w-0 pl-1"><MathText>{line}</MathText></li>)}</ol> : <MathText>{value}</MathText>}{!value.trim() && <p className="text-slate-400">暂无内容，请点击“编辑原文”填写。</p>}</div>}
  </section>;
}
export function MethodAICompletion({ content, disabled, onApply }: { content: MethodContent; disabled?: boolean; onApply: (suggestion: MethodCompletion, note: string) => void }) {
  const [busy,setBusy] = useState(false), [result,setResult] = useState<Result | null>(null), [error,setError] = useState(''), [snapshot,setSnapshot] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const missing = missingThinking(content), canFill = missing.signals || missing.motivation;
  const changed = !!result && snapshot !== JSON.stringify(content);
  return <section className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/40 p-4"><div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy || disabled || !canFill} className="rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm text-violet-900 disabled:opacity-40" onClick={async () => {
    const c = new AbortController(); controller.current = c; setSnapshot(JSON.stringify(content)); setBusy(true); setResult(null); setError('');
    try { const r = await fetch('/api/knowledge-graph/methods/complete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ content }), signal:c.signal });
      const data = await r.json() as Result & { error?: string }; if (!r.ok) throw Error(data.error || 'AI 补全失败。');
      const suggestion = methodCompletionSchema.parse(data.suggestion); if (!c.signal.aborted) setResult({ ...data, suggestion });
    } catch(e) { if (!c.signal.aborted) setError((e as Error).message); } finally { if (!c.signal.aborted) setBusy(false); }
  }}>{busy ? 'AI 正在补全…' : canFill ? 'AI 补全识别信号与思考过程' : '识别信号与思考过程已填写'}</button>
    {busy && <button type="button" className="text-sm underline" onClick={() => { controller.current?.abort(); setBusy(false); }}>取消生成</button>}</div>
    <p className="text-xs leading-6 text-slate-500">根据现有方法卡生成建议，只补空缺字段。可编辑后填入草稿，保存后由教师审核。</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {result && <div className="space-y-3"><p className="text-xs text-violet-900">AI 建议 · 待核查 · {result.model}</p>
      {missing.signals && <SuggestionField title="识别信号" list value={result.suggestion.signals.join('\n')} onChange={value => setResult(r => r && ({ ...r, suggestion:{ ...r.suggestion, signals:value.split('\n') } }))} />}
      {missing.motivation && <SuggestionField title="为什么想到这个方法？" value={result.suggestion.motivation} onChange={value => setResult(r => r && ({ ...r, suggestion:{ ...r.suggestion, motivation:value } }))} />}
      {changed && <p className="text-sm text-amber-700">方法内容已变化，请重新生成建议。</p>}
      <button type="button" disabled={disabled || changed || !canFill} className="rounded-lg bg-violet-700 px-4 py-2 text-sm text-white disabled:opacity-40" onClick={() => { try {
        const suggestion = methodCompletionSchema.parse({ signals:result.suggestion.signals.map(s=>s.trim()).filter(Boolean), motivation:result.suggestion.motivation.trim() });
        onApply(suggestion, `AI辅助补全，待教师核查；模型 ${result.model}；提示词 ${result.promptVersion}`); setResult(null); setError('');
      } catch { setError('请填写有效的识别信号和思考过程后再填入草稿。'); } }}>填入空缺字段</button>
      <button type="button" className="ml-3 text-sm underline" onClick={() => { setResult(null); setError(''); }}>放弃建议</button>
    </div>}
  </section>;
}

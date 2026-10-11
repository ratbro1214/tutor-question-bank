"use client";
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { checkLessonQuality, qualitySnapshot, type QualityIssue, type QualityReport } from '@/lib/lesson-quality';
import { qualityRepairTarget, type QualityPatch } from '@/lib/lesson-quality-ai';
import type { LessonContent } from '@/lib/lesson-plan';

type Proposal = { patch: QualityPatch; originalText: string; snapshot: string; revision: number; elapsedMs: number; aiRequests: number };
export function LessonQualityPanel({ id, revision, content, busy, accept, locate }: { id: string; revision: number; content: LessonContent; busy: boolean; accept: (next: LessonContent) => void; locate: (issue: QualityIssue) => void }) {
  const [report, setReport] = useState<QualityReport | null>(null), [proposal, setProposal] = useState<Proposal | null>(null);
  const [running, setRunning] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [metrics, setMetrics] = useState({ requests: 0, elapsedMs: 0 });
  const current = useRef({ content, revision }); current.current = { content, revision };
  const previous = useRef(content.questions), removed = useRef(false), controller = useRef<AbortController | null>(null);
  const last = useRef<{ mode: 'rules' | 'ai' | 'repair'; issue?: QualityIssue }>({ mode: 'rules' });
  useEffect(() => {
    if (previous.current.some(q => !content.questions.some(n => q.canonicalId === n.canonicalId && q.revisionId === n.revisionId))) removed.current = true;
    previous.current = content.questions;
  }, [content.questions]);
  useEffect(() => () => controller.current?.abort(), []);
  const snapshot = qualitySnapshot(content), stale = !!report && (report.snapshot !== snapshot || report.revision !== revision);
  async function call(mode: string, extra: object = {}) {
    const response = await fetch('/api/lesson-plans/' + id + '/quality', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.current?.signal,
      body: JSON.stringify({ mode, expectedRevision: revision, content, removedQuestions: removed.current, ...extra }) });
    const data = await response.json() as QualityReport & Proposal & { content: LessonContent; error?: string };
    setMetrics(v => ({ requests: v.requests + (data.aiRequests || 0), elapsedMs: data.elapsedMs || 0 }));
    if (!response.ok) throw Error(data.error || '质量检查失败，草稿保留。');
    return data;
  }
  async function run(mode: 'rules' | 'ai' | 'repair', issue?: QualityIssue) {
    if (busy || controller.current) return;
    if (mode === 'repair' && (!report || stale)) { setError('检查结果已过期，请先重新检查再生成修改建议。'); return; }
    last.current = { mode, issue }; setRunning(true); setError(''); setMessage(''); setProposal(null);
    if (mode === 'rules') setReport(checkLessonQuality(content, undefined, revision, removed.current));
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 125000);
    try {
      const result = await call(mode, issue ? { issue, snapshot: report?.snapshot } : {});
      if (mode === 'repair') { setProposal(result); setMessage('建议已生成，原教案尚未变化。'); }
      else setReport(result);
    } catch (e) { setError(abort.signal.aborted ? '请求已取消或超时，可重试；当前教案保留。' : (e as Error).message); }
    finally { clearTimeout(timer); controller.current = null; setRunning(false); }
  }
  async function apply() {
    if (!proposal || busy || running) return;
    setRunning(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      if (proposal.snapshot !== snapshot || proposal.revision !== revision) throw Error('建议已过期，请重新检查。');
      const result = await call('accept', { snapshot: proposal.snapshot, patch: proposal.patch });
      if (qualitySnapshot(current.current.content) !== proposal.snapshot || current.current.revision !== proposal.revision) throw Error('接受期间教案已变化，请重新检查。');
      accept(result.content); setProposal(null); setMessage('已接受为草稿并备份原内容，请保存后重新检查。');
    } catch (e) { setError((e as Error).message); }
    finally { clearTimeout(timer); controller.current = null; setRunning(false); }
  }
  const counts = (['error', 'warning', 'suggestion'] as const).map(s => report?.issues.filter(i => i.severity === s).length || 0);
  const labels = { error: '错误', warning: '警告', suggestion: '建议' };
  const locations = { overall: '整体建议', goals: '教学目标', analysis: '知识分析', flow: '教学流程', examples: '例题讲解', exercises: '课堂练习', summary: '课堂总结', structure: '结构化教案', stage: '教学环节', question: '题目引用' };
  return <details open className="space-y-3 rounded-xl border p-3"><summary className="cursor-pointer font-semibold">教案质量检查</summary>
    <p className="text-xs text-slate-500">快速检查不调用 AI；深度检查由教师主动发起，结果供核对。</p>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || running} onClick={() => run('rules')}>快速检查</Button><Button size="sm" disabled={busy || running} onClick={() => run('ai')}>AI 深度检查</Button></div>
    {running && <div role="status"><p className="text-sm">正在检查或生成建议，草稿保留中…</p><Button size="sm" variant="outline" onClick={() => controller.current?.abort()}>取消请求</Button></div>}
    {error && <div role="alert" className="text-sm text-amber-800">{error}<Button size="sm" variant="outline" disabled={busy || running} onClick={() => run(last.current.mode, last.current.issue)}>重试</Button></div>}
    <p className="text-xs">本面板收到的模型请求计数：{metrics.requests}；最近服务耗时：{metrics.elapsedMs.toFixed(1)} ms。连接中断未收到服务统计时，请求次数无法确定。</p>
    {message && <p role="status" className="text-xs">{message}</p>}
    {report && <><p className="text-xs">错误 {counts[0]} · 警告 {counts[1]} · 建议 {counts[2]}<br />{new Date(report.checkedAt).toLocaleString('zh-CN')} · v{report.revision} 的检查草稿 · {report.elapsedMs.toFixed(1)} ms · AI 请求 {report.aiRequests} 次</p>
      {stale && <p role="alert" className="text-sm text-amber-800">检查结果已过期，不能作为当前内容的结论，请重新检查。</p>}
      {!report.issues.length && !stale && <p className="text-sm">本次检查未发现所覆盖规则中的问题。</p>}
      <div className="max-h-[65vh] space-y-3 overflow-auto">{report.issues.map(issue => <article key={issue.issueId} className="space-y-2 rounded-lg border p-3 text-xs">
        <p className="font-semibold">{labels[issue.severity]} · {issue.source === 'ai' ? 'AI 待核对' : '规则'} · {issue.title}</p>
        <p>{issue.description}</p><p>依据：{issue.evidence}</p><p>位置：{issue.location.block === 'stage' ? `环节 ${(issue.location.index ?? 0) + 1}` : locations[issue.location.block]}</p><p>修改建议：{issue.suggestedAction}</p><p>可信度：{issue.confidence === 'certain' ? '确定' : issue.confidence === 'possible' ? '可能，待核对' : '依据不足'}</p>
        <Button size="sm" variant="outline" onClick={() => locate(issue)}>定位编辑区</Button>
        <label className="block">处理状态<select aria-label={'问题状态 ' + issue.title} disabled={stale} value={issue.status} onChange={e => setReport({ ...report, issues: report.issues.map(i => i.issueId === issue.issueId ? { ...i, status: e.target.value as QualityIssue['status'] } : i) })}><option value="pending">待处理</option><option value="resolved">已处理（教师标记）</option><option value="ignored">教师选择忽略</option></select></label>
        {qualityRepairTarget(issue, content) ? <Button size="sm" variant="outline" disabled={busy || running || stale} onClick={() => run('repair', issue)}>生成修改建议</Button> : <p>此项请手动核对修改。</p>}
      </article>)}</div></>}
    {proposal && <section className="space-y-2 rounded-lg border bg-slate-50 p-3 text-xs"><h3 className="font-semibold">局部建议对比 · 尚未接受</h3><p>目标：{proposal.patch.target}{proposal.patch.stageIndex !== null ? `，环节 ${proposal.patch.stageIndex + 1}` : ''}</p><p>原内容</p><pre className="whitespace-pre-wrap break-words">{proposal.originalText || '（空白）'}</pre><p>建议内容</p><pre className="whitespace-pre-wrap break-words">{proposal.patch.text}</pre>
      {(proposal.snapshot !== snapshot || proposal.revision !== revision) && <p role="alert">建议已过期，请重新生成。</p>}
      <Button size="sm" disabled={busy || running || proposal.snapshot !== snapshot || proposal.revision !== revision} onClick={apply}>接受局部建议</Button><Button size="sm" variant="outline" disabled={running} onClick={() => { setProposal(null); setMessage('已拒绝建议，教案未修改。'); }}>拒绝建议</Button>
    </section>}
  </details>;
}

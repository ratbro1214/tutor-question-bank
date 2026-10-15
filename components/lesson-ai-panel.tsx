"use client";
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Sparkles, LoaderCircle } from 'lucide-react';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { LessonStageView, LessonStructureView } from './lesson-structure-editor';
import { readApiResponse } from '@/lib/api-response';
import { lessonContentSchema, lessonDraftSchema, type LessonContent } from '@/lib/lesson-plan';
import { acceptLessonProposal } from '@/lib/lesson-ai-draft';
import { lessonEditActions, type LessonEdit, type LessonGenerationResult } from '@/lib/lesson-generation';

type Proposal = { result: LessonGenerationResult; original: string; edit?: LessonEdit };
export function LessonAIPanel({ id, revision, content, busy, accept }: { id: string; revision: number; content: LessonContent; busy: boolean; accept: (next: LessonContent) => void }) {
  const [availability, setAvailability] = useState<{ available: boolean; message: string; model: string } | null>(null);
  const [running, setRunning] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null), [stageIndex, setStageIndex] = useState(0);
  const [action, setAction] = useState<(typeof lessonEditActions)[number]>('优化表达'), [instruction, setInstruction] = useState(''), [minutes, setMinutes] = useState(5);
  const request = useRef<AbortController | null>(null), last = useRef<{ edit?: LessonEdit } | null>(null);
  const autoStarted = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/lesson-plans/' + id + '/generate', { signal: abort.signal, cache: 'no-store' }).then(readApiResponse<{ available: boolean; message: string; model: string }>).then(setAvailability).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => { abort.abort(); request.current?.abort(); };
  }, [id]);
  async function generate(edit?: LessonEdit) {
    if (request.current || busy) return;
    const abort = new AbortController(); request.current = abort; last.current = { edit };
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, 125000);
    setRunning(true); setError(''); setMessage(''); setProposal(null);
    try {
      const parsed = lessonContentSchema.parse(content), original = JSON.stringify(content);
      const response = await fetch('/api/lesson-plans/' + id + '/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: revision, content: parsed, edit }), signal: abort.signal });
      if (response.status === 413) throw Error('教案、所选题目或备份内容过大，请精简后重试；原教案保留。');
      const result = await readApiResponse<LessonGenerationResult>(response);
      if (!abort.signal.aborted) { setProposal({ result, original, edit }); setMessage('草稿已生成，请预览后接受或放弃。原教案尚未修改。'); }
    } catch (e) {
      if (abort.signal.aborted) setError(timedOut ? 'AI 请求超时；原教案保留，可重试或手动编辑。' : '已停止本次 AI 请求；原教案保留。');
      else setError(e instanceof Error ? e.message : '生成失败；原教案保留。');
    } finally { clearTimeout(timer); if (request.current === abort) { request.current = null; setRunning(false); } }
  }
  useEffect(() => {
    if (autoStarted.current || !availability?.available || busy || request.current) return;
    if (new URLSearchParams(window.location.search).get('design') !== '1') return;
    autoStarted.current = true;
    const url = new URL(window.location.href); url.searchParams.delete('design');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    void generate();
  });
  function acceptProposal() {
    if (!proposal) return;
    try { accept(acceptLessonProposal(content, proposal.original, proposal.result, proposal.edit)); setProposal(null); setMessage('已接受为未确认草稿，并保留修改前内容。请检查后保存。'); }
    catch (e) { setError((e as Error).message); }
  }
  const stale = proposal && JSON.stringify(content) !== proposal.original;
  return <div className="space-y-3"><h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-terracotta-700" />AI 备课助手</h2>
    <p className="text-xs text-slate-500">{availability?.message || '正在检查模型配置；手动编辑始终可用。'}</p>
    {availability?.available && <p className="text-xs text-slate-500">使用现有配置：{availability.model}（调用时检查连接）</p>}
    <Button className="w-full" disabled={busy || running || availability?.available === false} onClick={() => generate()}>{content.questions.length ? '结合题库生成课程草稿' : '根据专题与需求设计课程'}</Button>
    <p className="text-xs text-slate-500">{content.questions.length ? `使用 ${content.questions.length} 道题库例题，结合课程需求设计讲解、追问和练习。` : '可以先生成目标、讲解、活动与分层练习建议，再从教学资源区补选真实例题。'}</p>
    {content.structure && <fieldset disabled={busy || running} className="space-y-2 rounded-lg border p-3"><legend className="text-sm">局部修改</legend>
      <label className="block text-xs">指定环节<select aria-label="AI 指定教学环节" className="h-10 w-full rounded-lg border bg-white" value={stageIndex} onChange={e => setStageIndex(Number(e.target.value))}>{content.structure.stages.map((s, i) => <option key={i} value={i}>{i + 1}. {s.title}</option>)}</select></label>
      <label className="block text-xs">操作<select aria-label="AI 局部编辑操作" className="h-10 w-full rounded-lg border bg-white" value={action} onChange={e => setAction(e.target.value as typeof action)}>{lessonEditActions.map(a => <option key={a}>{a}</option>)}</select></label>
      <label className="block text-xs">教师要求（可选）<Textarea value={instruction} maxLength={2000} onChange={e => setInstruction(e.target.value)} /></label>
      {action === '调整课堂时间' && <label className="block text-xs">该环节分钟数<Input type="number" min={1} max={480} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /><span>只改此环节，课程总时长随之更新，接受前显示变化。</span></label>}
      <Button variant="outline" disabled={availability?.available === false} onClick={() => generate({ stageIndex, action, instruction, ...(action === '调整课堂时间' ? { minutes } : {}) })}>生成单环节建议</Button>
    </fieldset>}
    {running && <div role="status" className="ai-generating space-y-3 text-sm"><p className="flex items-center gap-2 font-medium text-terracotta-800"><LoaderCircle className="size-4 animate-spin" />正在编排教学思路…</p><p className="text-xs text-slate-500">正在组织目标、活动与课堂追问，原内容已保留。</p><Button variant="outline" onClick={() => request.current?.abort()}>停止生成</Button></div>}
    {error && <div role="alert" className="space-y-2 text-sm text-amber-800"><p>{error}</p><Button variant="outline" disabled={busy || running} onClick={() => { if (last.current) void generate(last.current.edit); else { setAvailability(null); void fetch('/api/lesson-plans/' + id + '/generate', { cache: 'no-store' }).then(readApiResponse<{ available: boolean; message: string; model: string }>).then(v => { setAvailability(v); setError(''); }).catch(e => setError(e.message)); } }}>重试</Button></div>}
    {message && <p role="status" className="text-xs">{message}</p>}
    {proposal && <section className="space-y-3 rounded-xl border bg-slate-50 p-3"><h3 className="font-semibold">AI 修改预览 · 未接受</h3>
      {proposal.result.warnings.map((w, i) => <p className="text-xs text-amber-800" key={i}>{w}</p>)}
      {proposal.result.mode === 'stage' && proposal.edit ? <><details open><summary>修改前（原内容已保留）</summary><LessonStageView stage={JSON.parse(proposal.original).structure.stages[proposal.edit.stageIndex]} /></details><h4 className="font-semibold">修改后</h4><LessonStageView stage={proposal.result.stage} /></> : proposal.result.mode === 'full' ? <div className="max-h-[70vh] overflow-auto"><LessonStructureView structure={proposal.result.structure} /></div> : null}
      {stale && <p role="alert" className="text-xs text-amber-800">生成期间教案已改变，请重新生成；当前内容不会被覆盖。</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || Boolean(stale)} onClick={acceptProposal}>接受为草稿</Button><Button variant="outline" onClick={() => { setProposal(null); setMessage('已放弃 AI 建议，原教案保留。'); }}>放弃</Button></div>
    </section>}
    {content.aiBackups.length > 0 && <details className="space-y-2"><summary className="text-sm">AI 修改前备份（最近 5 次）</summary><p className="text-xs">接受 AI 时已保留原内容，保存教案时一并保存。恢复也需要再次保存。</p>{content.aiBackups.map((backup, i) => <Button key={i} variant="outline" className="h-auto w-full whitespace-normal text-xs" disabled={busy || running} onClick={() => { try { const restored = lessonDraftSchema.parse(JSON.parse(backup.original)); accept({ ...restored, aiBackups: content.aiBackups }); setMessage('修改前内容已恢复为草稿，请核对并保存。'); setProposal(null); } catch { setError('备份无法解析，当前教案保留。'); } }}>{backup.action} · {new Date(backup.createdAt).toLocaleString('zh-CN')} · 恢复原内容</Button>)}</details>}
  </div>;
}

"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { MathText } from '@/components/math-text';
import { readApiResponse } from '@/lib/api-response';
import { LessonExportPanel } from './lesson-export-panel';
import { LessonQualityPanel } from './lesson-quality-panel';
import type { QualityIssue } from '@/lib/lesson-quality';
import { LessonAIPanel } from './lesson-ai-panel';
import { LessonStructureEditor } from './lesson-structure-editor';
import { LessonQuestionPicker } from './lesson-question-picker';
import { moveLessonQuestion, selectLessonQuestion, type LibraryCandidate } from '@/lib/lesson-question-selection';
import { lessonContentSchema, lessonDraftSchema, lessonStatusLabels, type LessonContent, type LessonPlan, type LessonWrite } from '@/lib/lesson-plan';

const panel = 'rounded-2xl border border-[var(--border)] bg-white p-5 space-y-4 min-w-0';
const select = 'h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm w-full';
async function api<T>(url: string, body?: unknown, method = 'POST', signal?: AbortSignal): Promise<T> {
  return readApiResponse<T>(await fetch(url, body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { cache: 'no-store', signal }));
}
function downloadDraft(content: LessonContent) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = '教案草稿恢复.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Settings({ content, change, disabled = false }: { content: LessonContent; change: (value: LessonContent) => void; disabled?: boolean }) {
  const field = <K extends keyof LessonContent>(key: K, value: LessonContent[K]) => change({ ...content, [key]: value });
  return <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
    <label className="space-y-2 text-sm sm:col-span-2">教学专题（必填）<Input aria-label="教学专题（必填）" value={content.topic} onChange={e => field('topic', e.target.value)} maxLength={160} placeholder="如：导数与函数单调性" required /></label>
    <label className="space-y-2 text-sm">学段<select aria-label="学段" className={select} value={content.stage} onChange={e => change({ ...content, stage: e.target.value as LessonContent['stage'], grade: e.target.value === '高中' ? '高三' : '初三' })}><option>初中</option><option>高中</option></select></label>
    <label className="space-y-2 text-sm">年级<Input aria-label="年级" value={content.grade} maxLength={30} onChange={e => field('grade', e.target.value)} /></label>
    <label className="space-y-2 text-sm">课程时长（分钟）<div className="flex gap-2"><select aria-label="常用课程时长" className={select} value={[45, 60, 90].includes(content.duration) ? content.duration : 'custom'} onChange={e => { if (e.target.value !== 'custom') field('duration', Number(e.target.value)); }}><option value="45">45</option><option value="60">60</option><option value="90">90</option><option value="custom">自定义</option></select><Input aria-label="课程时长分钟" type="number" min={1} max={480} value={content.duration} onChange={e => field('duration', Number(e.target.value))} /></div></label>
    <label className="space-y-2 text-sm">授课场景<select aria-label="授课场景" className={select} value={content.scenario} onChange={e => field('scenario', e.target.value as LessonContent['scenario'])}>{['一对一家教', '小班教学', '专题复习'].map(s => <option key={s}>{s}</option>)}</select></label>
    <label className="space-y-2 text-sm sm:col-span-2">基础水平描述（教师手填，可选）<Textarea aria-label="基础水平描述（教师手填，可选）" value={content.baseline} onChange={e => field('baseline', e.target.value)} placeholder="只填写已知情况，不自动推断学生掌握度。" /></label>
  </fieldset>;
}
type ListItem = Pick<LessonPlan, 'id' | 'status' | 'revision' | 'created_at' | 'updated_at'> & { topic: string; stage: string };
export function LessonPlanList() {
  const router = useRouter(), [items, setItems] = useState<ListItem[]>([]), [content, setContent] = useState(() => lessonContentSchema.parse({ topic: '未命名教案' }));
  const [creating, setCreating] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [stage, setStage] = useState(''), [topic, setTopic] = useState(''), [status, setStatus] = useState('active'), [refresh, setRefresh] = useState(0);
  const pending = useRef<{ id: string; operationId: string } | null>(null);
  useEffect(() => { const controller = new AbortController();
    const timer = setTimeout(() => { setLoading(true); setError(''); api<{ items: ListItem[] }>('/api/lesson-plans?' + new URLSearchParams({ stage, topic, status }), undefined, 'GET', controller.signal).then(d => setItems(d.items)).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); }, 250);
    return () => { clearTimeout(timer); controller.abort(); }; }, [stage, topic, status, refresh]);
  async function create() { setBusy(true); setError(''); try {
    const parsed = lessonContentSchema.parse(content); pending.current ??= { id: crypto.randomUUID(), operationId: crypto.randomUUID() };
    const result = await api<LessonPlan>('/api/lesson-plans', { ...pending.current, expectedRevision: 0, status: 'draft', content: parsed });
    router.push('/lesson-plans/' + result.id);
  } catch (e) { setError(e instanceof Error ? e.message : '创建失败'); } finally { setBusy(false); } }
  async function action(item: ListItem, copy: boolean) { setBusy(true); setError(''); try {
    const source = await api<LessonPlan>('/api/lesson-plans/' + item.id);
    if (copy) { const result = await api<LessonPlan>('/api/lesson-plans', { id: crypto.randomUUID(), operationId: crypto.randomUUID(), expectedRevision: 0, status: 'draft', content: { ...source.content, topic: source.content.topic.slice(0, 155) + '（副本）' } }); router.push('/lesson-plans/' + result.id); }
    else { await api('/api/lesson-plans/' + item.id, { operationId: crypto.randomUUID(), expectedRevision: source.revision, status: item.status === 'archived' ? 'draft' : 'archived', content: source.content }, 'PUT'); setRefresh(v => v + 1); }
  } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold">AI 智能备课</h1><p className="mt-2 text-sm text-slate-500">从真实题库建立教案，教师编辑、确认并保存版本。</p></div><Button onClick={() => { setCreating(v => !v); setContent(lessonContentSchema.parse({ topic: '未命名教案' })); pending.current = null; }}>创建新教案</Button></div>
    {error && <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}<Button variant="outline" className="ml-3" onClick={() => setRefresh(v => v + 1)}>重试读取</Button></div>}
    {creating && <section className={panel}><h2 className="font-semibold">新建备课任务</h2><Settings content={content} change={v => { setContent(v); pending.current = null; }} disabled={busy} /><label className="block space-y-2 text-sm">教学目标（可稍后填写）<Textarea disabled={busy} value={content.goals} onChange={e => { setContent({ ...content, goals: e.target.value }); pending.current = null; }} /></label><Button disabled={busy} onClick={create}>{busy ? '正在创建…' : '创建并编辑'}</Button></section>}
    <section className={panel}><div className="grid gap-3 sm:grid-cols-3"><select aria-label="按学段筛选" className={select} value={stage} onChange={e => setStage(e.target.value)}><option value="">全部学段</option><option>初中</option><option>高中</option></select><Input aria-label="按教学专题筛选" placeholder="筛选教学专题" value={topic} onChange={e => setTopic(e.target.value)} /><select aria-label="按状态筛选" className={select} value={status} onChange={e => setStatus(e.target.value)}><option value="active">未归档</option><option value="archived">已归档</option><option value="all">全部状态</option></select></div>
      {loading ? <p role="status">正在读取教案…</p> : !items.length ? <p className="py-8 text-center text-sm text-slate-500">暂无匹配教案，创建一份开始备课。</p> : items.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><Link className="font-semibold text-[var(--primary)]" href={'/lesson-plans/' + item.id}>{item.topic}</Link><p className="text-xs text-slate-500">{item.stage} · {lessonStatusLabels[item.status]} · v{item.revision}</p><p className="mt-2 text-xs text-slate-500">创建：{new Date(item.created_at).toLocaleString('zh-CN')} · 修改：{new Date(item.updated_at).toLocaleString('zh-CN')}</p></div><div className="flex gap-2"><Link href={'/lesson-plans/' + item.id}><Button variant="outline">继续编辑</Button></Link><Button variant="outline" disabled={busy} onClick={() => action(item, true)}>复制</Button><Button variant="ghost" disabled={busy} onClick={() => action(item, false)}>{item.status === 'archived' ? '恢复为草稿' : '归档'}</Button></div></article>)}
    </section></div>;
}

export function LessonPlanEditor({ id }: { id: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState<LessonPlan | null>(null), [content, setContent] = useState<LessonContent | null>(null), [state, setState] = useState<LessonPlan['status']>('draft');
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [retry, setRetry] = useState(0);
  const [replaceId, setReplaceId] = useState<string | undefined>(), [resourceError, setResourceError] = useState('');
  const [resources, setResources] = useState<LessonPlan['resources']>([]), [side, setSide] = useState<'resources' | 'assistant' | null>(null);
  const [confirmation, setConfirmation] = useState<{ message: string; resolve: (accepted: boolean) => void } | null>(null);
  const ask = (message: string) => new Promise<boolean>(resolve => setConfirmation({ message, resolve }));
  function answer(accepted: boolean) { confirmation?.resolve(accepted); setConfirmation(null); }
  const pending = useRef<LessonWrite | null>(null);
  useEffect(() => { const controller = new AbortController(); api<LessonPlan>('/api/lesson-plans/' + id, undefined, 'GET', controller.signal).then(p => { setPlan(p); setContent(p.content); setState(p.status); setResources(p.resources); setDirty(false); setError(''); pending.current = null; }).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [id, retry]);
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  function change(value: LessonContent) {
    if (value.structure && JSON.stringify(value.questions) !== JSON.stringify(content?.questions)) {
      const allowed = new Map(value.questions.map(q => [q.canonicalId, q.revisionId]));
      const removed = new Set(value.structure.examples.filter(e => allowed.get(e.canonicalId) !== e.revisionId).map(e => e.canonicalId));
      value = { ...value, structure: { ...value.structure, examples: value.structure.examples.filter(e => allowed.get(e.canonicalId) === e.revisionId), stages: value.structure.stages.map(stage => ({ ...stage, questionIds: stage.questionIds.filter(id => allowed.has(id) && !removed.has(id)) })) } };
    }
    setContent(value); setDirty(true); setNotice(''); pending.current = null; }
  async function save() { if (!plan || !content) return; setBusy(true); setError(''); try {
    pending.current ??= { operationId: crypto.randomUUID(), expectedRevision: plan.revision, status: state, content: (state === 'ready' ? lessonContentSchema : lessonDraftSchema).parse(content) };
    const p = await api<LessonPlan>('/api/lesson-plans/' + id, pending.current, 'PUT'); setPlan(p); setContent(p.content); setResources(p.resources); setDirty(false); pending.current = null; setNotice('已保存到数据库，版本 v' + p.revision);
  } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function add(candidate: LibraryCandidate, replacing?: string) { if (!content) return; setBusy(true); setResourceError(''); try {
    const detail = await api<{ id: string; current_revision_id: string; text: string; imageUrl: string | null; identity_status: string }>('/api/math-library/' + candidate.id);
    if (detail.id !== candidate.id) throw Error('题库返回身份不匹配，请重新检索。');
    const questions = selectLessonQuestion(content.questions, { canonicalId: detail.id, revisionId: detail.current_revision_id, purpose: '讲解', notes: '' }, replacing);
    change({ ...content, questions }); setReplaceId(undefined);
    setResources(old => [...old.filter(r => r.canonicalId !== detail.id && r.canonicalId !== replacing), { canonicalId: detail.id, revisionId: detail.current_revision_id, text: detail.text, imageUrl: detail.imageUrl, identityStatus: detail.identity_status }]);
  } catch (e) { setResourceError((e as Error).message); } finally { setBusy(false); } }
  async function loadVersion(version: string) { if (dirty && !await ask('载入版本将替换当前未保存草稿。请先保存或下载恢复文件。是否继续？')) return; setBusy(true); try { const p = await api<LessonPlan>('/api/lesson-plans/' + id + '?version=' + version); change(p.content); setResources(p.resources); setNotice('历史内容已载入草稿，保存后创建新版本。'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function importDraft(file?: File) {
    if (!file) return;
    try {
      if (file.size > 512000) throw Error('恢复文件过大。');
      const draft = lessonDraftSchema.parse(JSON.parse(await file.text()));
      if (dirty && !await ask('导入将替换未保存草稿，是否继续？')) return;
      change(draft); setResources([]); setNotice('恢复文件已载入草稿，保存时会核验全部题目引用。');
    } catch { setError('恢复文件无效或超过大小限制。原草稿已保留。'); }
  }
  async function copyDraft() {
    if (!content) return; setBusy(true); setError('');
    try { const p = await api<LessonPlan>('/api/lesson-plans', { id: crypto.randomUUID(), operationId: crypto.randomUUID(), expectedRevision: 0, status: 'draft', content: lessonDraftSchema.parse({ ...content, topic: content.topic.slice(0, 155) + '（副本）' }) }); setDirty(false); router.push('/lesson-plans/' + p.id); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!plan || !content) return <div className={panel}>{error ? <p role="alert">{error}</p> : <p>正在读取教案…</p>}<Button variant="outline" onClick={() => setRetry(v => v + 1)}>重新读取</Button></div>;
  const resourcesPanel = <section className={panel}><h2 className="font-semibold">教学资源 · Canonical 智能选题</h2>
    <LessonQuestionPicker key={content.stage} content={content} resources={resources} busy={busy} replaceId={replaceId} cancelReplace={() => setReplaceId(undefined)} choose={add} />
    <Link className="block text-xs text-[var(--primary)]" href="/math-library" target="_blank">打开完整题库 ↗</Link>
    {resourceError && <p role="alert" className="text-sm text-amber-800">{resourceError}</p>}
    <h3 className="font-semibold">已选择例题（{content.questions.length}）</h3>
    {content.questions.map((q, index) => <div className="space-y-2 rounded-xl border p-3 text-xs" key={q.canonicalId}>
      <Link className="text-[var(--primary)]" target="_blank" href={'/math-library/' + q.canonicalId}>例题 {index + 1} · 查看原题 ↗</Link>
      <p className="break-all text-slate-500">Canonical：{q.canonicalId}<br/>引用版本：{q.revisionId}（原题页展示当前版本）</p>
      <label className="block">例题用途<select aria-label={'例题 ' + (index + 1) + ' 用途'} disabled={busy} className={select} value={q.purpose} onChange={e => change({ ...content, questions: content.questions.map(v => v.canonicalId === q.canonicalId ? { ...v, purpose: e.target.value as typeof q.purpose } : v) })}>{['导入', '讲解', '练习', '检测'].map(p => <option key={p}>{p}</option>)}</select></label>
      <div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" disabled={busy || index === 0} onClick={() => change({ ...content, questions: moveLessonQuestion(content.questions, index, -1) })}>上移</Button><Button variant="ghost" size="sm" disabled={busy || index === content.questions.length - 1} onClick={() => change({ ...content, questions: moveLessonQuestion(content.questions, index, 1) })}>下移</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => setReplaceId(q.canonicalId)}>替换</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => { change({ ...content, questions: content.questions.filter(v => v.canonicalId !== q.canonicalId) }); setResources(old => old.filter(r => r.canonicalId !== q.canonicalId)); if (replaceId === q.canonicalId) setReplaceId(undefined); }}>移除</Button></div>
    </div>)}</section>;
  function locateQuality(issue: QualityIssue) {
    const l = issue.location;
    const target = l.block === 'stage' ? 'lesson-stage-' + l.index : l.block === 'question' ? 'lesson-question-' + l.index : ['goals', 'analysis', 'flow', 'examples', 'exercises', 'summary'].includes(l.block) ? 'lesson-field-' + l.block : l.block === 'structure' ? 'lesson-structure' : 'lesson-editor';
    const element = document.getElementById(target);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (element?.querySelector('textarea,input,select') as HTMLElement | null)?.focus({ preventScroll: true });
  }
  const assistant = <section className={panel}><LessonQualityPanel key={'quality-' + id} id={id} revision={plan.revision} content={content} busy={busy} accept={next => { change(next); setState('draft'); }} locate={locateQuality} /><LessonAIPanel key={id} id={id} revision={plan.revision} content={content} busy={busy} accept={next => { change(next); setState('draft'); pending.current = null; }} /><LessonExportPanel id={id} versionId={plan.current_version_id} revision={plan.revision} dirty={dirty} busy={busy} /><h3 className="font-semibold">已保存版本</h3><div className="max-h-72 space-y-2 overflow-auto">{plan.versions.map(v => <button disabled={busy} key={v.id} className="block w-full rounded-lg border p-2 text-left text-xs" onClick={() => loadVersion(v.id)}>v{v.revision} · {new Date(v.created_at).toLocaleString('zh-CN')}<span className="block text-slate-500">载入历史内容为草稿</span></button>)}</div></section>;
  return <div className="space-y-5"><AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open) answer(false); }}><AlertDialogContent><AlertDialogTitle>保护未保存草稿</AlertDialogTitle><AlertDialogDescription>{confirmation?.message}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel onClick={() => answer(false)}>保留草稿</AlertDialogCancel><AlertDialogAction onClick={() => answer(true)}>继续操作</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/lesson-plans" onClick={e => { if (dirty) { e.preventDefault(); void ask('当前草稿未保存，仍要离开？').then(accepted => { if (accepted) router.push('/lesson-plans'); }); } }} className="text-xs text-slate-500">← 历史教案</Link><h1 className="mt-2 text-2xl font-semibold">{content.topic || '备课编辑器'}</h1><p className="text-xs text-slate-500">v{plan.revision} · {dirty ? '有未保存修改' : '已保存'} · {lessonStatusLabels[plan.status]}</p></div><div className="flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center rounded-lg border bg-white px-3 text-sm">导入恢复文件<input className="sr-only" type="file" accept=".json,application/json" disabled={busy} onChange={e => { void importDraft(e.target.files?.[0]); e.target.value = ""; }} /></label><Button variant="outline" disabled={busy} onClick={copyDraft}>草稿另存为副本</Button><Button variant="outline" onClick={() => downloadDraft(content)}>下载草稿恢复文件</Button><Button disabled={busy} onClick={save}>{busy ? '正在处理…' : '保存教案'}</Button></div></div>
    {error && <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}<p>请重试保存，或先下载草稿恢复文件。冲突时可在新标签页查看服务器内容。</p><Link target="_blank" href={'/lesson-plans/' + id}>查看服务器版本 ↗</Link><Button className="ml-3" variant="outline" disabled={busy} onClick={async () => { if (!dirty || await ask('重新载入会替换草稿，请先下载恢复文件。是否继续？')) setRetry(v => v + 1); }}>重新载入</Button></div>}{notice && <p role="status" className="text-sm text-[var(--primary)]">{notice}</p>}
    <div className="flex gap-2 xl:hidden"><Button variant="outline" onClick={() => setSide(side === 'resources' ? null : 'resources')}>教学资源</Button><Button variant="outline" onClick={() => setSide(side === 'assistant' ? null : 'assistant')}>AI 助手与历史</Button></div>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(220px,1fr)_minmax(360px,2.4fr)_minmax(200px,0.9fr)]"><aside className={side === 'resources' ? 'block xl:block' : 'hidden xl:block'}>{resourcesPanel}</aside>
      <section id="lesson-editor" className={panel}><h2 className="font-semibold">教案编辑区</h2><Settings content={content} change={v => { change(v); setReplaceId(undefined); }} disabled={busy} /><label className="block space-y-2 text-sm">教案状态<select aria-label="教案状态" disabled={busy} className={select} value={state} onChange={e => { setState(e.target.value as LessonPlan['status']); setDirty(true); pending.current = null; }}>{Object.entries(lessonStatusLabels).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label>
        {content.structure && <LessonStructureEditor structure={content.structure} duration={content.duration} questions={content.questions} disabled={busy} change={structure => change({ ...content, structure })} />}
        <h3 className="font-semibold">教师手写内容与生成依据（AI 接受后仍保留）</h3>
        {([['goals', '教学目标'], ['analysis', '知识分析'], ['flow', '教学流程'], ['examples', '例题讲解'], ['exercises', '课堂练习'], ['summary', '课堂总结']] as const).map(([key, name]) => <label id={"lesson-field-" + key} key={key} className="block space-y-2 text-sm font-medium">{name}<Textarea aria-label={name} disabled={busy} className="min-h-28 font-normal" value={content[key]} maxLength={20000} onChange={e => change({ ...content, [key]: e.target.value })} placeholder={'手动填写' + name} /></label>)}
        <section className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">学生版讲义设置</h3><p className="text-xs text-slate-500">学生版只显示此处知识提要、题库题干与原图，不显示教师专用讲解和参考答案。留空时使用题库知识点名称。</p><label className="block text-sm">学生知识提要<Textarea aria-label="学生知识提要" disabled={busy} value={content.studentSummary} maxLength={20000} onChange={e => change({ ...content, studentSummary: e.target.value })} /></label><label className="block text-sm">每题作答空间行数<Input aria-label="作答空间行数" disabled={busy} type="number" min={2} max={20} value={content.answerLines} onChange={e => change({ ...content, answerLines: Number(e.target.value) })} /></label></section>
        <h3 className="font-semibold">真实题目引用</h3>{!content.questions.length && <p className="text-sm text-slate-500">从教学资源区添加例题；每道题保存身份及原题内容版本。</p>}{content.questions.map((q, index) => { const r = resources.find(v => v.canonicalId === q.canonicalId && v.revisionId === q.revisionId); return <article id={"lesson-question-" + index} key={q.canonicalId} className="space-y-3 rounded-xl border p-4"><p className="text-sm font-semibold">例题 {index + 1} · {q.purpose} · 固定内容版本</p>{r && <MathText>{r.text}</MathText>}{r?.imageUrl && <img src={r.imageUrl} alt={'例题 ' + (index + 1) + ' 原始题图'} className="max-h-80 w-full object-contain" />}{!r?.imageUrl && <p className="text-xs text-amber-800">此版本没有可用题图，请打开原题核对必要条件。</p>}<p className="text-xs text-slate-500">身份状态：{r?.identityStatus || '未读取'}；不代表答案已审核。</p><label className="block text-sm">教师讲解备注<Textarea aria-label="教师讲解备注" disabled={busy} value={q.notes} onChange={e => change({ ...content, questions: content.questions.map((v, i) => i === index ? { ...v, notes: e.target.value } : v) })} /></label></article>; })}
      </section><aside className={side === 'assistant' ? 'block xl:block' : 'hidden xl:block'}>{assistant}</aside></div></div>;
}

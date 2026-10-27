'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { quadraticCases, topicCase, topicReference, newTopicSession, nextTopicStage, appendTopicEvent, parseTopicSession, topicAdvice, stageNames, type TopicSession, type TopicEvent } from '@/lib/quadratic-topic';
import { MethodConditionResult } from './method-condition-form';

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm';
const buttonClass = 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40';
export function QuadraticTopicLab() {
  const [session, setSession] = useState<TopicSession>(() => newTopicSession('E1', 'rehearsal'));
  const [caseId, setCaseId] = useState('E1');
  const [response, setResponse] = useState('');
  const [correctness, setCorrectness] = useState<TopicEvent['correctness']>('uncertain');
  const [support, setSupport] = useState<TopicEvent['support']>('independent');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showReference, setShowReference] = useState(false);
  const [exported, setExported] = useState('');
  const hasUnsavedChanges = response.trim().length > 0 || (session.events.length > 0 && exported !== JSON.stringify(session));
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
      if (!link || link.download || (link.target && link.target !== '_self')) return;
      const destination = new URL(link.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.origin === window.location.origin) return;
      if (!window.confirm('本页有尚未导出的记录或草稿。确认离开？')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardLink, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guardLink, true); };
  }, [hasUnsavedChanges]);
  const anchor = topicCase(session.anchorId), stage = nextTopicStage(session), advice = topicAdvice(session);
  const options = stage === 'initial' || stage === 'teaching' ? [anchor] : quadraticCases.filter(c => c.family === anchor.family && !session.events.some(e => e.caseId === c.id));
  const selected = options.find(c => c.id === caseId) ?? options[0] ?? anchor;
  function configure(anchorId: string, mode: TopicSession['mode']) {
    setSession(newTopicSession(anchorId, mode)); setCaseId(anchorId); setShowReference(false); setResponse(''); setError(''); setNotice(''); setExported('');
  }
  function save() {
    if (!stage) return;
    try {
      const next = appendTopicEvent(session, { id: crypto.randomUUID(), stage, caseId: selected.id, response,
        correctness: stage === 'teaching' ? 'uncertain' : correctness,
        support: stage === 'teaching' ? 'explained' : support,
        at: new Date().toISOString(), targetId: session.events[0]?.id ?? null });
      setSession(next); setResponse(''); setCorrectness('uncertain'); setSupport('independent'); setShowReference(false); setError('');
      setNotice('已加入本次记录；请导出文件保留进度。');
    } catch (e) { setError(e instanceof Error ? e.message : '记录未保存，请检查输入。'); }
  }
  function exportSession() {
    const payload = { session, exportedAt: new Date().toISOString(), advice: topicAdvice(session),
      source: '研发自编专题题，非独立评测；教师手动录入，不是智能体生成的学生作答。',
      cases: [...new Set([session.anchorId, ...session.events.map(e => e.caseId)])].map(id => {
        const row = topicCase(id); return { ...row, reference: topicReference(row) };
      }) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `二次函数专题-${session.mode}-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(JSON.stringify(session));
    setNotice('已请求导出；请确认文件下载完成。稍后可导入继续记录。');
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-terracotta-800">数学专题 · 教学流程试点</p><h1 className="mt-2 text-3xl font-semibold">二次函数参数问题</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">从一份作答出发，完成追问、讲解和新题检查。围绕端点、量词、顶点和次数退化，观察学生是否能解释方法成立的条件。</p></div><div className="flex gap-2"><button className={buttonClass} onClick={exportSession}>导出本次记录</button><label className={`${buttonClass} cursor-pointer ${session.events.length ? 'opacity-40' : ''}`}>导入继续<input className="sr-only" aria-label="导入专题记录" type="file" accept=".json,application/json" disabled={session.events.length > 0} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      try { if (file.size > 256 * 1024) throw Error('记录文件不能超过256KB。'); const raw = JSON.parse(await file.text()); const restored = parseTopicSession(raw.session);
        setSession(restored); setCaseId(restored.anchorId); setResponse(''); setError(''); setShowReference(false); setNotice('已恢复记录。题目版本：quadratic-parameter-v1。');
      } catch (err) { setError(err instanceof Error ? err.message : '文件无法读取。'); }
    }} /></label></div></header>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">本页记录暂存在当前页面，刷新或离开前请导出；导出只包含已加入时间线的内容，不包含编辑框草稿。不会自动写入学生档案。请使用匿名描述。演练记录与实际课堂观察分开标识，16道研发自编题尚未经独立教师审阅。</div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="text-sm text-slate-600">{notice}</p>}
    <section className="surface-card space-y-4 p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">选择观察重点</h2>{session.events.length > 0 && <button className={buttonClass} onClick={() => { if (window.confirm('请确认需要保留的记录已导出。开始另一轮会清空当前页面记录，是否继续？')) configure(session.anchorId, session.mode); }}>开始另一轮</button>}</div><div className="grid gap-4 md:grid-cols-2"><label className="text-sm">记录用途<select className={inputClass} value={session.mode} disabled={session.events.length > 0} onChange={e => configure(session.anchorId, e.target.value as TopicSession['mode'])}><option value="rehearsal">教学演练（手动填写示例）</option><option value="observed">实际课堂观察（手动记录）</option></select></label><label className="text-sm">起始题目<select className={inputClass} value={session.anchorId} disabled={session.events.length > 0} onChange={e => configure(e.target.value, session.mode)}>{quadraticCases.map(c => <option key={c.id} value={c.id}>{c.family} · {c.id} {c.title}</option>)}</select></label></div><p className="text-xs text-slate-500">开始记录后固定原题和用途。实际课堂的间隔复查至少在新题检查24小时后填写；演练允许当次走完整个流程。</p></section>
    <ol className="grid gap-2 sm:grid-cols-5" aria-label="专题教学进度">{Object.entries(stageNames).map(([key, label], index) => <li key={key} aria-current={stage === key ? 'step' : undefined} className={`rounded-xl border p-3 text-sm ${stage === key ? 'border-terracotta-400 bg-terracotta-50 font-semibold' : 'bg-white text-slate-500'}`}>{session.events[index] ? '✓' : index + 1} {label}</li>)}</ol>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="surface-card space-y-4 p-5"><h2 className="text-lg font-semibold">{stage ? stageNames[stage] : '本次流程已记录完成'}</h2>{stage ? <>
        <label className="block text-sm">{stage === 'teaching' ? '讲解围绕原题展开' : '本次题目'}<select className={inputClass} value={selected.id} disabled={options.length < 2} onChange={e => { setCaseId(e.target.value); setShowReference(false); setResponse(''); }}>{options.map(c => <option value={c.id} key={c.id}>{c.id} · {c.title}</option>)}</select></label>
        <article className="rounded-xl bg-slate-50 p-5"><p className="text-xs text-slate-500">{selected.family} · {selected.id}</p><p className="mt-3 text-lg leading-8">{selected.question}</p></article>
        {stage === 'diagnostic' && <p className="rounded-lg bg-indigo-50 p-3 text-sm leading-6">追问建议：{selected.prompt}</p>}
        <label className="block text-sm">{stage === 'teaching' ? '讲解内容、依据与仍待核实的问题' : '作答原文与可观察到的过程'}<textarea className={inputClass} rows={5} maxLength={6000} value={response} onChange={e => setResponse(e.target.value)} placeholder={stage === 'teaching' ? '结合前两条记录，写下实际讲解内容…' : '可只记录最终答案；不确定的错因请保留待核实…'} /></label>
        {stage !== 'teaching' && <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">教师判断<select className={inputClass} value={correctness} onChange={e => setCorrectness(e.target.value as TopicEvent['correctness'])}><option value="uncertain">暂不能判断</option><option value="correct">正确</option><option value="incorrect">错误</option></select></label><label className="text-sm">完成方式<select className={inputClass} value={support} onChange={e => setSupport(e.target.value as TopicEvent['support'])}><option value="independent">独立完成</option><option value="prompted">提示后完成</option><option value="explained">跟随讲解完成</option></select></label></div>}
        <button className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm text-white disabled:opacity-40" disabled={!response.trim()} onClick={save}>加入本次记录</button>
        <details open={showReference} onToggle={e => setShowReference(e.currentTarget.open)} className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">教师参考：适用方法与标准式核验</summary><p className="my-3 text-sm leading-6">{selected.method}</p>{showReference && <MethodConditionResult result={topicReference(selected)} />}</details>
      </> : <p className="text-sm leading-6">请导出保留此次作答与讲解记录。后续可在学生档案中另行记录实际教学活动；本页不自动推断掌握率。</p>}</section>
      <aside className="space-y-4"><section className="surface-card space-y-3 p-5"><h2 className="font-semibold">{advice.title}</h2><p className="text-sm leading-6 text-slate-600">{advice.detail}</p><p className="text-xs text-slate-500">{advice.evidenceIds.length ? `依据：${advice.evidenceIds.length}条作答记录，见下方时间线。` : '尚无作答证据。'}</p><p className="text-xs text-slate-500">建议来自固定流程规则；本页没有调用模型生成作答。</p></section><section className="surface-card space-y-3 p-5"><h2 className="font-semibold">继续使用教学工具</h2>{[['/math-methods', '查看解题方法库'], ['/math-library', '从数学题库选择资料'], ['/lesson-plans', '编写与检查教案'], ['/evaluation', '查看教学策略回放']].map(([href, text]) => <Link key={href} href={href} className="block text-sm text-terracotta-800 underline">{text} →</Link>)}<p className="text-xs leading-5 text-slate-500">这些入口打开现有工具；本次专题记录需单独导出。</p></section></aside>
    </div>
    <section className="surface-card space-y-4 p-5"><h2 className="font-semibold">本次教学时间线 · {session.mode === 'rehearsal' ? '演练' : '课堂观察'}</h2>{!session.events.length && <p className="text-sm text-slate-500">保存首次作答后，后续记录会明确关联到这份作答。</p>}{session.events.map(e => <article key={e.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{stageNames[e.stage]} · {e.caseId}</strong><time>{new Date(e.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{e.response}</p>{e.stage !== 'teaching' && <p className="mt-2 text-xs text-slate-500">{{ correct: '教师判断正确', incorrect: '教师判断错误', uncertain: '暂不能判断' }[e.correctness]} · {{ independent: '独立完成', prompted: '提示后完成', explained: '跟随讲解完成' }[e.support]}</p>}<details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">查看原题与记录关联</summary><p className="mt-2">{topicCase(e.caseId).question}</p><p className="mt-2 break-all">记录编号：{e.id}{e.targetId && `；验证目标：${e.targetId}`}</p></details></article>)}</section>
  </div>;
}

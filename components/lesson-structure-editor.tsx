"use client";
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { MathText } from './math-text';
import { alignStageMinutes, answerStatusLabels, stageKinds, type LessonStage, type LessonStructure } from '@/lib/lesson-structure';
import { moveLessonStage, newLessonStage } from '@/lib/lesson-stage-edit';

export function LessonStageView({ stage }: { stage: LessonStage }) {
  return <div className="space-y-2 text-sm"><p className="font-semibold">{stage.title} · {stage.kind} · {stage.minutes} 分钟</p>
    {([['教学目的', stage.purpose], ['教学活动', stage.activities], ['讲解建议', stage.explanation], ['课堂追问', stage.followUps.join('\n')]]).map(([label, text]) => <div key={label}><p className="font-medium">{label}</p><MathText>{text}</MathText></div>)}
    <p className="break-all text-xs text-slate-500">引用题目：{stage.questionIds.join('、') || '无'}</p></div>;
}
export function LessonStructureView({ structure }: { structure: LessonStructure }) {
  return <div className="space-y-4">{([['objectives', '教学目标'], ['prerequisites', '前置知识'], ['focus', '教学重点'], ['difficulties', '教学难点'], ['classroomQuestions', '课堂追问'], ['commonMistakes', '常见易错点'], ['practiceSuggestions', '巩固练习建议']] as const).map(([key, title]) => <div key={key}><h3 className="font-semibold">{title}</h3><MathText>{structure[key].join('\n')}</MathText></div>)}
    <h3 className="font-semibold">课堂教学流程</h3>{structure.stages.map((s, i) => <div key={i} className="rounded-xl border p-3"><LessonStageView stage={s} /></div>)}
    <h3 className="font-semibold">例题讲解安排与关键思路</h3>{structure.examples.map(e => <div key={e.canonicalId} className="space-y-2 rounded-xl border p-3 text-sm"><p className="break-all text-xs">{e.canonicalId} · 版本 {e.revisionId}</p><p className="text-amber-800">{answerStatusLabels[e.answerStatus]}</p><MathText>{e.arrangement + '\n' + e.keyIdeas + '\n追问：' + e.followUps.join('\n') + '\n易错点：' + e.mistakes.join('\n')}</MathText></div>)}
    <h3 className="font-semibold">课堂总结</h3><MathText>{structure.summary}</MathText></div>;
}
export function LessonStructureEditor({ structure, duration, questions, change, disabled }: { structure: LessonStructure; duration: number; questions: { canonicalId: string; purpose: string }[]; change: (s: LessonStructure) => void; disabled: boolean }) {
  const total = structure.stages.reduce((n, s) => n + s.minutes, 0);
  return <section id="lesson-structure" className="space-y-4"><h2 className="text-lg font-semibold">课堂教学设计</h2><p className="text-xs text-amber-800">AI 建议仍需教师确认；解析审核状态不会因接受教案而改变。</p>
    <fieldset disabled={disabled} className="space-y-6">
      {([['objectives', '教学目标'], ['prerequisites', '前置知识'], ['focus', '教学重点'], ['difficulties', '教学难点'], ['classroomQuestions', '课堂追问'], ['commonMistakes', '常见易错点'], ['practiceSuggestions', '巩固练习建议']] as const).map(([key, title]) => <label key={key} className="lesson-block block text-sm"><span className="lesson-block-title">{title}</span><span className="ml-2 text-xs text-slate-400">每行一项</span><Textarea aria-label={'结构化' + title} value={structure[key].join('\n')} onChange={e => change({ ...structure, [key]: e.target.value.split('\n') })} /></label>)}
      <p className={total === duration ? 'text-sm' : 'text-sm text-amber-800'}>环节合计 {total} / 课程 {duration} 分钟</p>
      {total !== duration && <Button variant="outline" disabled={duration < structure.stages.length || structure.stages.some(s => !Number.isFinite(s.minutes) || s.minutes < 1)} onClick={() => change({ ...structure, stages: alignStageMinutes(structure.stages, duration) })}>按课程总时长调整各环节</Button>}
      <p className="text-xs text-slate-500">教师可自定环节顺序；新增或删除后请核对总时长，再保存导出。</p>
      <Button variant="outline" disabled={structure.stages.length >= 16} onClick={() => change({ ...structure, stages: [...structure.stages, newLessonStage()] })}>新增教学环节</Button>
      {structure.stages.map((stage, index) => <details id={"lesson-stage-" + index} key={index} open={index === 0} className="lesson-stage quiet-details space-y-3"><summary className="flex flex-wrap items-center gap-3 text-sm font-semibold"><span className="text-terracotta-700">环节 {index + 1}</span><span className="min-w-0 flex-1">{stage.title || stage.kind}</span><span className="rounded-full bg-muted px-2 py-1 text-xs font-normal text-slate-500">{stage.minutes} 分钟</span></summary>
        <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" disabled={index === 0} onClick={() => change({ ...structure, stages: moveLessonStage(structure.stages, index, -1) })}>环节上移</Button><Button size="sm" variant="outline" disabled={index === structure.stages.length - 1} onClick={() => change({ ...structure, stages: moveLessonStage(structure.stages, index, 1) })}>环节下移</Button><Button size="sm" variant="ghost" disabled={structure.stages.length <= 2} onClick={() => change({ ...structure, stages: structure.stages.filter((_, i) => i !== index) })}>删除环节</Button></div>
        <label className="block text-sm">环节类型<select className="h-10 w-full rounded-lg border" value={stage.kind} onChange={e => change({ ...structure, stages: structure.stages.map((s, i) => i === index ? { ...s, kind: e.target.value as LessonStage['kind'] } : s) })}>{stageKinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label className="block text-sm">标题<Input aria-label={'环节' + (index + 1) + '标题'} value={stage.title} onChange={e => change({ ...structure, stages: structure.stages.map((s, i) => i === index ? { ...s, title: e.target.value } : s) })} /></label>
        <label className="block text-sm">预计时长（分钟）<Input aria-label={'环节' + (index + 1) + '时长'} type="number" min={1} max={480} value={stage.minutes} onChange={e => change({ ...structure, stages: structure.stages.map((s, i) => i === index ? { ...s, minutes: Number(e.target.value) } : s) })} /></label>
        {([['purpose', '教学目的'], ['activities', '教学活动'], ['explanation', '讲解建议']] as const).map(([key, title]) => <label key={key} className="block text-sm">{title}<Textarea aria-label={'环节' + (index + 1) + title} value={stage[key]} onChange={e => change({ ...structure, stages: structure.stages.map((s, i) => i === index ? { ...s, [key]: e.target.value } : s) })} /></label>)}
        <label className="block text-sm">追问（每行一项）<Textarea aria-label={'环节' + (index + 1) + '追问'} value={stage.followUps.join('\n')} onChange={e => change({ ...structure, stages: structure.stages.map((s, i) => i === index ? { ...s, followUps: e.target.value.split('\n') } : s) })} /></label>
        <fieldset className="space-y-1"><legend className="text-xs">该环节引用题目</legend>{questions.map((q, i) => <label key={q.canonicalId} className="block break-all text-xs"><input type="checkbox" checked={stage.questionIds.includes(q.canonicalId)} onChange={e => change({ ...structure, stages: structure.stages.map((s, n) => n === index ? { ...s, questionIds: e.target.checked ? [...s.questionIds, q.canonicalId] : s.questionIds.filter(id => id !== q.canonicalId) } : s) })} /> 题 {i + 1} · {q.purpose} · {q.canonicalId}</label>)}</fieldset></details>)}
      {structure.examples.map((example, index) => <div key={example.canonicalId} className="lesson-stage space-y-3"><h3 className="text-sm font-semibold">例题讲解 {index + 1}</h3><p className="text-xs text-amber-800">{answerStatusLabels[example.answerStatus]}</p>
        {([['arrangement', '讲解安排'], ['keyIdeas', '关键思路']] as const).map(([key, label]) => <label className="block text-sm" key={key}>{label}<Textarea value={example[key]} onChange={e => change({ ...structure, examples: structure.examples.map((v, i) => i === index ? { ...v, [key]: e.target.value } : v) })} /></label>)}
        {([['followUps', '课堂追问'], ['mistakes', '易错点']] as const).map(([key, label]) => <label className="block text-sm" key={key}>{label}<Textarea value={example[key].join('\n')} onChange={e => change({ ...structure, examples: structure.examples.map((v, i) => i === index ? { ...v, [key]: e.target.value.split('\n') } : v) })} /></label>)}
      </div>)}
      <label className="block text-sm">课堂总结<Textarea aria-label="结构化课堂总结" value={structure.summary} onChange={e => change({ ...structure, summary: e.target.value })} /></label>
    </fieldset></section>;
}

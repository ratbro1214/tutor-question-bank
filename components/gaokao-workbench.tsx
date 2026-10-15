"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Crop, LoaderCircle, Save, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PaperCropEditor } from '@/components/paper-crop-editor';
import { ImageLightbox } from '@/components/image-lightbox';
import { LibraryQuestionText } from '@/components/library-question-text';
import { MathText } from '@/components/math-text';
import { chaptersForStage, taxonomyForStage } from '@/lib/taxonomy';
import { questionTypes, type Classification } from '@/lib/classification';
import { buildQuestionCrops, locateQuestionAnchors, type QuestionCrop, type PaperQuestion } from '@/lib/paper';
import { openPaperDocument, cropQuestionImage, type PaperDocument } from '@/lib/pdf-browser';

type Question = { number: number; text: string; section: string; classification: Classification | null; answer: string; solution: string; saved: (PaperQuestion & { canonicalId: string | null; contentRevision: string | null }) | null };
type Data = { key: string; title: string; year: number; volume: number; originalFilename: string; sourceUrl: string; paperId: string | null; questions: Question[] };
type Draft = { text: string; chapter: string; knowledge: string[]; difficulty: Classification['difficulty']; questionType: string };
const chapters = chaptersForStage('高中'), taxonomy = taxonomyForStage('高中');
const selectClass = 'mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';
async function read<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init), data = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(data.error || '操作失败，请重试。'); return data; }
function initialDraft(q: Question): Draft { const c = q.saved?.classification || q.classification; return { text: q.saved?.questionText || q.text, chapter: c?.chapter.code || chapters[0][0], knowledge: c?.knowledge_points.map(p => p.code) || [], difficulty: c?.difficulty || '中等', questionType: c?.question_type || '综合题' }; }

export function GaokaoWorkbench({ paperKey }: { paperKey: string }) {
  const [data, setData] = useState<Data | null>(null), [number, setNumber] = useState(1), [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(''), [dirty, setDirty] = useState(false), [filter, setFilter] = useState('');
  const [cropOpen, setCropOpen] = useState(false), [doc, setDoc] = useState<PaperDocument | null>(null), [crop, setCrop] = useState<QuestionCrop | null>(null), [image, setImage] = useState<Blob | null>(null), [preview, setPreview] = useState('');
  const docRef = useRef<PaperDocument | null>(null), fileRef = useRef<Blob | null>(null), alive = useRef(true), controllerRef = useRef<AbortController | null>(null);
  const question = data?.questions.find(q => q.number === number);
  useEffect(() => {
    alive.current = true; const controller = new AbortController(); controllerRef.current = controller;
    read<Data>(`/api/gaokao/${encodeURIComponent(paperKey)}`, { signal: controller.signal, cache: 'no-store' }).then(d => { if (alive.current) { setData(d); setNumber(d.questions[0].number); setDraft(initialDraft(d.questions[0])); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { alive.current = false; controller.abort(); void docRef.current?.destroy(); docRef.current = null; fileRef.current = null; };
  }, [paperKey]);
  useEffect(() => { if (!image) { setPreview(''); return; } const url = URL.createObjectURL(image); setPreview(url); return () => URL.revokeObjectURL(url); }, [image]);
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  function patch(values: Partial<Draft>) { setDraft(current => current ? { ...current, ...values } : current); setDirty(true); setMessage(''); }
  function select(q: Question) { if (busy || (dirty && !window.confirm('当前修改尚未保存，切换题目会放弃这些修改。继续切换吗？'))) return; setNumber(q.number); setDraft(initialDraft(q)); setCrop(null); setImage(null); setDirty(false); setError(''); setMessage(''); }
  async function document() {
    if (docRef.current) return docRef.current;
    const response = await fetch(data!.sourceUrl, { signal: controllerRef.current?.signal }); if (!response.ok) throw new Error('原卷文件无法读取。');
    const blob = new Blob([await response.arrayBuffer()], { type: 'application/pdf' }); fileRef.current = blob;
    const opened = await openPaperDocument(blob);
    if (!alive.current) { await opened.destroy(); throw new Error('页面已关闭。'); }
    docRef.current = opened; setDoc(opened); return opened;
  }
  async function editCrop() {
    if (!question || busy) return; setBusy('正在打开原卷…'); setError('');
    try {
      const opened = await document();
      const detected = buildQuestionCrops(opened.pages, locateQuestionAnchors(opened.pages)).find(c => c.number === number);
      const regions = question.saved?.regions || detected?.regions || [{ page: 1, x: .04, y: .04, width: .92, height: .3 }];
      const primary = regions.reduce((a, b) => b.width * b.height > a.width * a.height ? b : a);
      if (alive.current) { setCrop(current => current || { number, regions: [primary], text: draft?.text || '' }); setCropOpen(true); }
    } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(''); }
  }
  async function applyCrop(next: QuestionCrop) {
    if (!doc || busy) return; setBusy('正在生成裁剪预览…'); setError('');
    try { const blob = await cropQuestionImage(doc, next.regions); if (alive.current) { setCrop(next); setImage(blob); setDirty(true); setCropOpen(false); setMessage('裁剪预览已更新，点击“保存入题库”完成保存。'); } }
    catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(''); }
  }
  async function save() {
    if (!data || !question || !draft || busy) return;
    if (!draft.knowledge.length) { setError('请至少选择一个核心知识点。'); return; }
    if (!question.saved && !image) { setError('请先从原卷裁剪这道题，再保存入库。'); return; }
    setBusy('正在保存题图与分类…'); setError(''); setMessage('');
    try {
      let paperId = data.paperId;
      if (!paperId) {
        if (!fileRef.current) await document();
        const upload = new FormData(); upload.set('file', new File([fileRef.current!], data.originalFilename, { type: 'application/pdf' })); upload.set('title', data.title);
        const result = await read<{ paper: { id: string } }>('/api/papers', { method: 'POST', body: upload, signal: controllerRef.current?.signal }); paperId = result.paper.id;
        if (alive.current) setData(current => current ? { ...current, paperId } : current);
      }
      const form = new FormData();
      form.set('metadata', JSON.stringify({ paperId, number, expectedRevision: question.saved?.revision || 0, expectedContentRevision: question.saved?.contentRevision || null, text: draft.text, chapter: draft.chapter, knowledge: draft.knowledge, difficulty: draft.difficulty, questionType: draft.questionType, regions: image ? crop!.regions : question.saved!.regions }));
      if (image) form.set('image', new File([image], `question-${number}.jpg`, { type: 'image/jpeg' }));
      await read(`/api/gaokao/${encodeURIComponent(paperKey)}`, { method: 'POST', body: form, signal: controllerRef.current?.signal });
      const refreshed = await read<Data>(`/api/gaokao/${encodeURIComponent(paperKey)}`, { cache: 'no-store', signal: controllerRef.current?.signal });
      if (alive.current) { setData(refreshed); setDraft(initialDraft(refreshed.questions.find(q => q.number === number)!)); setImage(null); setDirty(false); setMessage(`第 ${number} 题已保存，题图和分类已同步到数学题库。`); }
    } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(''); }
  }
  const points = taxonomy.filter(([, , owner]) => owner !== 'METHOD' && (owner === draft?.chapter || draft?.knowledge.some(code => taxonomy.find(p => p[0] === code)?.[2] === owner)));
  if (!data || !draft || !question) return <div className="surface-card p-12 text-center">{error ? <p role="alert" className="text-amber-800">{error}</p> : <><LoaderCircle className="mr-2 inline size-5 animate-spin" />正在打开真题工作台…</>}<Link href="/gaokao" className="mt-4 block text-sm text-terracotta-800">返回真题资料库</Link></div>;
  const savedCount = data.questions.filter(q => q.saved).length;
  return <div className="space-y-6"><header><Link href="/gaokao" className="inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="size-4" />返回真题资料库</Link><div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold sm:text-3xl">{data.title}</h1><p className="mt-2 text-sm text-slate-500">{data.questions.length} 道真题 · 已保存 {savedCount} 道 · 裁剪与分类逐题核对</p></div><a href={data.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"><FileText className="size-4" />查看完整原卷</a></div></header>
    {error && <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}{message && <p role="status" className="rounded-xl bg-terracotta-50 p-4 text-sm text-terracotta-800">{message}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]"><aside className="surface-card space-y-4 p-4 lg:sticky lg:top-5"><div className="flex items-center justify-between"><h2 className="font-semibold">题目导航</h2><span className="text-xs text-slate-400">{savedCount}/{data.questions.length}</span></div><select aria-label="题目整理状态" className={selectClass} value={filter} onChange={e => setFilter(e.target.value)}><option value="">全部题目</option><option value="pending">待整理</option><option value="saved">已保存</option></select><div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto">{data.questions.filter(q => !filter || (filter === 'saved' ? q.saved : !q.saved)).map(q => <button type="button" disabled={!!busy} aria-label={`第 ${q.number} 题${q.saved ? '，已保存' : '，待整理'}`} aria-current={number === q.number ? 'true' : undefined} key={q.number} onClick={() => select(q)} className={`relative h-11 rounded-lg border text-sm font-medium ${number === q.number ? 'border-terracotta-500 bg-terracotta-50 text-terracotta-800' : 'border-slate-200 bg-white text-slate-600 hover:border-terracotta-300'}`}>{q.number}{q.saved && <Check className="absolute bottom-1 right-1 size-3 text-emerald-600" />}</button>)}</div><p className="text-xs leading-5 text-slate-400">带 ✓ 的题目已保存。点击题号，可继续调整裁剪和分类。</p>{data.paperId && <Link href={`/math-library?paper=${data.paperId}`} className="block text-sm text-terracotta-800">查看本卷已入库题目 →</Link>}</aside>
      <div className="min-w-0 space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h2 className="text-xl font-semibold">第 {number} 题</h2><Badge variant="outline">{question.section || '原卷题目'}</Badge><span className="text-xs text-slate-500">{dirty ? '有未保存修改' : question.saved ? '已保存' : '待整理'}</span></div><Button disabled={!!busy} onClick={() => void save()}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}{busy || '保存入题库'}</Button></div>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="min-w-0 space-y-5"><section className="surface-card overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 p-4"><h3 className="font-semibold">原题图片</h3><Button variant="outline" size="sm" disabled={!!busy} onClick={() => void editCrop()}><Crop />{question.saved || image ? '重新裁剪' : '从原卷裁剪'}</Button></div>{preview || question.saved?.imageUrl ? <ImageLightbox src={preview || question.saved!.imageUrl} alt={`第 ${number} 题`}><button type="button" className="block w-full cursor-zoom-in p-4"><img className="h-auto w-full" src={preview || question.saved!.imageUrl} alt={`第 ${number} 题图片，点击放大`} /></button></ImageLightbox> : <div className="space-y-4 p-6"><LibraryQuestionText text={draft.text} /><p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">尚未保存题图。点击“从原卷裁剪”，把题干、选项与图形完整框入。</p></div>}{preview && <p className="border-t p-3 text-xs text-terracotta-800">这是裁剪预览，保存入题库后生效。</p>}</section>
          <details className="surface-card p-5"><summary className="cursor-pointer font-medium">核对文字题干</summary><Textarea aria-label="核对文字题干" value={draft.text} onChange={e => patch({ text: e.target.value })} className="mt-4 min-h-44" /><p className="mt-2 text-xs text-slate-500">文字用于题库检索；公式和图形请对照原卷核对。</p></details>
          <details className="surface-card p-5"><summary className="cursor-pointer font-medium">来源参考答案与解析</summary><div className="mt-4 space-y-4 text-sm leading-7"><p className="text-xs text-slate-500">外部资料提供，尚未经教师核查。</p><MathText>{question.answer || '来源未提供独立答案，请查看参考解析。'}</MathText><MathText>{question.solution || '来源未提供详细解析。'}</MathText></div></details>
        </div><section className="surface-card space-y-5 p-5"><div><h3 className="text-lg font-semibold">题目分类</h3><p className="mt-1 text-xs leading-5 text-slate-500">核对章节与核心知识点，保存后即可按分类检索。</p></div><fieldset disabled={!!busy} className="space-y-4"><label className="block text-sm">主章节<select aria-label="主章节" className={selectClass} value={draft.chapter} onChange={e => patch({ chapter: e.target.value, knowledge: [] })}>{chapters.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">难度<select aria-label="难度" className={selectClass} value={draft.difficulty} onChange={e => patch({ difficulty: e.target.value as Draft['difficulty'] })}>{['基础', '中等', '较难'].map(d => <option key={d}>{d}</option>)}</select></label><label className="text-sm">题型<select aria-label="题型" className={selectClass} value={draft.questionType} onChange={e => patch({ questionType: e.target.value })}>{questionTypes.map(t => <option key={t}>{t}</option>)}</select></label></div><div><div className="mb-3 flex justify-between text-sm"><span>核心知识点</span><span className="text-slate-400">{draft.knowledge.length}/4</span></div><div className="flex max-h-96 flex-wrap gap-2 overflow-y-auto rounded-xl bg-slate-50 p-3">{points.map(([code, name]) => { const selected = draft.knowledge.includes(code); return <button type="button" key={code} aria-pressed={selected} onClick={() => { if (!selected && draft.knowledge.length >= 4) { setError('最多选择 4 个核心知识点。'); return; } setError(''); patch({ knowledge: selected ? draft.knowledge.filter(k => k !== code) : [...draft.knowledge, code] }); }} className={`rounded-xl border px-3 py-2 text-left text-xs leading-5 ${selected ? 'border-terracotta-400 bg-terracotta-50 text-terracotta-800' : 'border-slate-200 bg-white text-slate-600'}`}>{name}</button>; })}</div></div></fieldset>{question.saved?.canonicalId && <Link href={`/math-library/${question.saved.canonicalId}`} className="block text-sm text-terracotta-800">打开题库中的这道题 →</Link>}</section></div>
      </div></div>
    <Dialog open={cropOpen} onOpenChange={value => { if (!busy) setCropOpen(value); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>第 {number} 题 · 从原卷裁剪</DialogTitle><DialogDescription>拖动框选题干、全部选项和图形；跨页内容请主动添加片段。</DialogDescription></DialogHeader>{busy && <p className="text-sm text-slate-500">{busy}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{doc && crop && <fieldset disabled={!!busy}><PaperCropEditor key={number} doc={doc} crop={crop} lockNumber onApply={next => void applyCrop(next)} onClose={() => setCropOpen(false)} /></fieldset>}</DialogContent></Dialog>
  </div>;
}

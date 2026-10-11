"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FileText, FileUp, LoaderCircle, Scissors, Sparkles } from "lucide-react";
import { WorkspaceMetric } from "@/components/workspace-metric";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/math-text";
import { PaperCropEditor } from "@/components/paper-crop-editor";
import { PaperArchive } from "@/components/paper-archive";
import { buildQuestionCrops, locateQuestionAnchors, parseQuestionSelection, type PaperQuestion, type PaperSummary, type QuestionAnchor, type QuestionCrop, type PaperExcludedBlock } from "@/lib/paper";
import { detectionTiles, detectionRows, mergeDetectedAnchors } from '@/lib/paper-detection';
import { readApiResponse } from '@/lib/api-response';
import { cropQuestionImage, openPaperDocument, type PaperDocument } from "@/lib/pdf-browser";
import type { PaperAnalysisMode } from '@/lib/paper-analysis';

const inputClass = "rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta-600";
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  return readApiResponse<T>(response);
}
const statusLabel = (q: PaperQuestion) => q.status === "processing" ? "正在处理" : q.status === "pending" && q.explanation ? "裁切已改，待重解" : q.explanation ? q.explanation.content.status === "needs_context" ? "待补充条件" : "解析已保存" : q.status === "failed" ? "待重试" : q.classification ? "已分类 · 未解析" : "待分类";
type PageDetection = { anchors: Omit<QuestionAnchor,'page'>[]; excluded: Omit<PaperExcludedBlock,'page'>[]; isAnswerPage?: boolean };

export function PaperWorkbench({ paperId }: { paperId?: string }) {
  const router = useRouter();
  const [paperQuery, setPaperQuery] = useState(""); const [paperStatus, setPaperStatus] = useState("");
  const [papers, setPapers] = useState<PaperSummary[]>([]), [paper, setPaper] = useState<PaperSummary | null>(null), [questions, setQuestions] = useState<PaperQuestion[]>([]);
  const [file, setFile] = useState<File | null>(null), [title, setTitle] = useState(""), [stage, setStage] = useState("高中");
  const [solutionFile, setSolutionFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [crops, setCrops] = useState<QuestionCrop[]>([]), [preparing, setPreparing] = useState(false), [doc, setDoc] = useState<PaperDocument | null>(null);
  const [selectedCrops, setSelectedCrops] = useState<number[]>([]), [selectedQuestions, setSelectedQuestions] = useState<number[]>([]), [selection, setSelection] = useState("");
  const [editingCrop, setEditingCrop] = useState<{ crop: QuestionCrop; index: number } | null>(null), [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [activeQuestionId, setActiveQuestionId] = useState(""), [running, setRunning] = useState(false);
  const [cancellable, setCancellable] = useState(false);
  const [editedNumbers, setEditedNumbers] = useState<number[]>([]);
  const docRef = useRef<PaperDocument | null>(null), abortRef = useRef<AbortController | null>(null), alive = useRef(true);
  const operationRef = useRef<{ questionId: string; operationId: string } | null>(null);
  const detectionRef=useRef<{doc:PaperDocument|null;results:Map<number,PageDetection>}>({doc:null,results:new Map()});

  useEffect(() => {
    if (paperId) return;
    const reloadPapers = () => { void api<{ papers: PaperSummary[] }>("/api/papers").then(data => { if (alive.current) setPapers(data.papers); }).catch(() => {}); };
    window.addEventListener("paper-import-completed", reloadPapers);
    return () => window.removeEventListener("paper-import-completed", reloadPapers);
  }, [paperId]);

  const prepare = useCallback(async (source: PaperSummary) => {
    setBusy("正在读取试卷并定位题号…"); setError(""); setMessage(""); setEditingCrop(null);
    try {
      const response = await fetch(source.sourceUrl); if (!response.ok) throw Error("原试卷读取失败，请重试。");
      const blob = new Blob([await response.arrayBuffer()], { type: source.sourceType });
      const opened = await openPaperDocument(blob);
      if (!alive.current) { await opened.destroy(); return; }
      await docRef.current?.destroy(); docRef.current = opened; setDoc(opened);
      const detected = buildQuestionCrops(opened.pages, locateQuestionAnchors(opened.pages));
      setCrops(detected); setSelectedCrops(detected.map(c => c.number)); setEditedNumbers(detected.map(c=>c.number)); setPreparing(true); setSelection("");
      setMessage(detected.length ? `已定位 ${detected.length} 道题，请检查选项、图形和跨页内容是否完整。` : "未从文字层定位到题号。可用 AI 定位，或手动框选指定题目。");
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "试卷读取失败。"); }
    finally { if (alive.current) setBusy(""); }
  }, []);
  const refresh = useCallback(async () => {
    if (!paperId) return null;
    const data = await api<{ paper: PaperSummary; questions: PaperQuestion[] }>(`/api/papers/${paperId}`);
    if (alive.current) { setPaper(data.paper); setQuestions(data.questions); }
    return data;
  }, [paperId]);
  useEffect(() => {
    alive.current = true; let disposed = false;
    async function load() {
      try {
        if (paperId) {
          const data = await refresh(); if (!data || disposed) return;
          setSelectedQuestions(data.questions.filter(q => !q.explanation || q.status !== "ready" || !!q.error).map(q => q.number)); setActiveQuestionId(data.questions[0]?.id || "");
          if (!data.questions.length) await prepare(data.paper);
        } else { const data = await api<{ papers: PaperSummary[] }>("/api/papers"); if (!disposed) setPapers(data.papers); }
      } catch (reason) { if (!disposed) setError(reason instanceof Error ? reason.message : "加载失败。"); }
      finally { if (!disposed) setLoading(false); }
    }
    void load();
    return () => { disposed = true; alive.current = false; abortRef.current?.abort(); void docRef.current?.destroy(); docRef.current = null; };
  }, [paperId, prepare, refresh]);
  useEffect(() => {
    if (!doc || !preparing) return;
    let disposed = false; const urls: string[] = [];
    void (async () => {
      await Promise.resolve(); if (disposed) return; setPreviewUrls({});
      for (const crop of crops) {
        if (disposed) break;
        try {
          const blob = await cropQuestionImage(doc, crop.regions); if (disposed) break;
          const url = URL.createObjectURL(blob); urls.push(url); setPreviewUrls(current => ({ ...current, [crop.number]: url }));
        } catch { if (!disposed) setError(`第 ${crop.number} 题预览失败，请调整裁切。`); }
      }
    })();
    return () => { disposed = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [doc, crops, preparing]);

  async function upload() {
    if (!file) return;
    setBusy("正在保存原试卷…"); setError("");
    try {
      const form = new FormData(); form.set("file", file); form.set("title", title || file.name.replace(/\.[^.]+$/, ""));
      const result = await api<{ paper: PaperSummary }>("/api/papers", { method: "POST", body: form });
      if (solutionFile) {
        setBusy("试卷已保存，正在关联配套解析…");
        const paired = new FormData(); paired.set('file', solutionFile);
        try { await api(`/api/papers/${result.paper.id}/solutions`, { method: 'POST', body: paired }); }
        catch (reason) { throw Error(`试卷已保存。配套解析上传失败：${reason instanceof Error ? reason.message : '请重试'}。可从试卷的“配套解析审核”入口继续上传。`); }
      }
      router.push(`/papers/${result.paper.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "上传失败。"); }
    finally { setBusy(""); }
  }
  async function detectWithAI() {
    if (!doc) return;
    if(detectionRef.current.doc!==doc)detectionRef.current={doc,results:new Map()};
    const cache=detectionRef.current.results;
    const abort = new AbortController(); abortRef.current = abort; setCancellable(true); setBusy("AI 正在定位题号…"); setError("");
    let activePage=1;
    function publish(complete:boolean) {
      const anchors:QuestionAnchor[]=[],excluded:PaperExcludedBlock[]=[];
      let answerPage=Infinity;
      for(const [page,result] of cache){if(result.isAnswerPage){answerPage=Math.min(answerPage,page);continue;}anchors.push(...result.anchors.map(a=>({...a,page})));excluded.push(...result.excluded.map(b=>({...b,page})));}
      let detected=buildQuestionCrops(doc!.pages.filter(p=>cache.has(p.page)&&p.page<answerPage),mergeDetectedAnchors(anchors),excluded);
      // The last question may continue onto a page that has not finished yet.
      if(!complete)detected=detected.slice(0,-1);
      if(alive.current){setCrops(detected);setSelectedCrops(detected.map(c=>c.number));setSelection('');setEditedNumbers(detected.filter(c=>questions.some(q=>q.number===c.number)).map(c=>c.number));}
      return detected.length;
    }
    try {
      for (const page of doc.pages) {
        activePage=page.page;
        if(cache.has(page.page)){if(cache.get(page.page)!.isAnswerPage)break;continue;}
        setBusy(`AI 正在定位第 ${page.page}/${doc.pages.length} 页…`);
        const canvas = await doc.renderPage(page.page);
        const tiles = detectionTiles(canvas.width, canvas.height), form = new FormData();
        const pixels = canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
        const rows = detectionRows(pixels,canvas.width,canvas.height);
        form.set('rows',JSON.stringify(rows));
        form.set('tiles', JSON.stringify(tiles)); form.set('pageHeight', String(canvas.height));
        for (const tile of tiles) {
          const part = document.createElement('canvas'); part.width = tile.width; part.height = tile.height;
          part.getContext('2d')!.drawImage(canvas, 0, tile.top, tile.width, tile.height, 0, 0, tile.width, tile.height);
          const ctx=part.getContext('2d')!;ctx.fillStyle='#0055dd';ctx.font=`bold ${Math.round(canvas.width*.016)}px sans-serif`;
          for(const row of rows.filter(r=>r.top>=tile.top&&r.bottom<tile.top+tile.height)){
            ctx.fillText(`R${row.id}`,2,row.top-tile.top+Math.round(canvas.width*.015));
            ctx.fillRect(Math.round(canvas.width*.035),row.top-tile.top,3,Math.max(3,row.bottom-row.top));
          }
          const blob = await new Promise<Blob>((resolve,reject)=>part.toBlob(b=>b?resolve(b):reject(Error('页面图片生成失败。')), 'image/jpeg', .92));
          form.set(`tile${tile.index}`, new File([blob], `tile-${tile.index}.jpg`, {type:'image/jpeg'}));
        }
        const result = await api<PageDetection>("/api/papers/detect", { method: "POST", body: form, signal: abort.signal });
        cache.set(page.page,result);
        if (result.isAnswerPage) break;
        const count=publish(page.page===doc.pages.length);
        setMessage(`已完成 ${cache.size}/${doc.pages.length} 页，已定位 ${count} 道完整题目。`);
      }
      const count=publish(true);
      setMessage(`已按实际题号行定位 ${count} 道题，保留相邻题号之间的完整内容。请核对预览后保存；已有同题号的旧裁切将在保存时更新。`);
    } catch (reason) {
      const count=cache.size?publish(false):0;
      if(!abort.signal.aborted)setError(`第 ${activePage} 页定位失败：${reason instanceof Error?reason.message:'请重试。'}`);
      setMessage(`${abort.signal.aborted?'已停止定位。':''}已保留 ${cache.size} 页的结果，展示 ${count} 道完整题目。再次点击 AI 定位题号会继续未完成的页面。`);
    }
    finally { if (alive.current) { setBusy(""); setCancellable(false); } if (abortRef.current === abort) abortRef.current = null; }
  }
  function selectNumbers() {
    try { const numbers = parseQuestionSelection(selection, preparing ? crops.map(c => c.number) : questions.map(q => q.number)); if (preparing) setSelectedCrops(numbers); else setSelectedQuestions(numbers); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "题号无效。"); }
  }
  async function run(list: PaperQuestion[], regenerate = false, mode: PaperAnalysisMode = 'classify') {
    if (abortRef.current) return;
    const label = mode === 'classify' ? '分类' : '解析';
    const abort = new AbortController(); abortRef.current = abort; setCancellable(true); setRunning(true); setError(""); let success = 0, failed = 0;
    try {
      for (const question of list) {
        if (abort.signal.aborted) break;
        if (!regenerate && !question.error && question.status !== 'processing' && (mode === 'classify' ? question.classification?.education_stage === stage : question.explanation && question.status === 'ready')) continue;
        setBusy(`正在${label}第 ${question.number} 题 · 已完成 ${success}/${list.length}`); setActiveQuestionId(question.id);
        setQuestions(current => current.map(q => q.id === question.id ? { ...q, status: "processing", error: "" } : q));
        try {
          const operationId = crypto.randomUUID(); operationRef.current = { questionId: question.id, operationId };
          const result = await api<{ question: PaperQuestion }>(`/api/papers/${paperId}/questions/${question.id}/analysis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ educationStage: stage, regenerate, operationId, mode }), signal: abort.signal });
          if (alive.current) setQuestions(current => current.map(q => q.id === question.id ? result.question : q)); success++;
        } catch (reason) {
          if (abort.signal.aborted) break; failed++;
          if (alive.current) setQuestions(current => current.map(q => q.id === question.id ? { ...q, status: q.explanation || q.classification ? "ready" : "failed", error: reason instanceof Error ? reason.message : `${label}失败。` } : q));
        } finally { operationRef.current = null; }
      }
      if (alive.current) { await refresh(); setMessage(`${abort.signal.aborted ? "已停止。" : "本次处理完成。"}成功${label} ${success} 题${failed ? `，失败 ${failed} 题，可单独重试` : ""}。${mode === 'classify' ? '分类已保存；未生成完整解析，可按需逐题生成。' : '已完成解析均已保存。'}`); }
    } finally { if (alive.current) { setRunning(false); setBusy(""); setCancellable(false); } if (abortRef.current === abort) abortRef.current = null; }
  }
  async function stop() {
    const operation = operationRef.current; abortRef.current?.abort();
    if (operation && paperId) {
      try { await api(`/api/papers/${paperId}/questions/${operation.questionId}/analysis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cancel: true, operationId: operation.operationId }) }); await refresh(); }
      catch { if (alive.current) setError("停止状态暂未确认，可稍后刷新查看。已完成解析仍然保存。"); }
    }
  }
  async function saveCrops(generate: boolean) {
    if (!doc || !paper || !selectedCrops.length) return;
    setBusy("正在保存裁切题目…"); setError(""); const stored: PaperQuestion[] = [];
    try {
      for (const crop of crops.filter(c => selectedCrops.includes(c.number))) {
        setBusy(`正在保存第 ${crop.number} 题…`);
        const blob = await cropQuestionImage(doc, crop.regions), form = new FormData();
        form.set("image", new File([blob], `question-${crop.number}.jpg`, { type: "image/jpeg" }));
        const existing = questions.find(q => q.number === crop.number);
        form.set("metadata", JSON.stringify({ number: crop.number, regions: crop.regions, text: crop.text.slice(0, 16000), replace: editedNumbers.includes(crop.number), expectedRevision: existing?.revision || 0 }));
        const result = await api<{ question: PaperQuestion }>(`/api/papers/${paper.id}/questions`, { method: "POST", body: form }); stored.push(result.question);
      }
      const data = await refresh(); setPreparing(false); setSelectedQuestions(stored.map(q => q.number)); setActiveQuestionId(stored[0]?.id || data?.questions[0]?.id || "");
      setMessage(`已保存 ${stored.length} 道题，重新打开套卷可继续查看。`);
      if (generate) await run(stored);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "裁切保存失败。已保存的题目仍然保留。"); await refresh().catch(() => {}); }
    finally { setBusy(""); }
  }
  const active = questions.find(q => q.id === activeQuestionId), blocked = !!busy || loading;
  const selected = preparing ? selectedCrops : selectedQuestions;
  const available = preparing ? crops.map(c => c.number) : questions.map(q => q.number);
  function toggle(number: number) { const setter = preparing ? setSelectedCrops : setSelectedQuestions; setter(current => current.includes(number) ? current.filter(n => n !== number) : [...current, number]); }

  return <div className="space-y-6">
    <header className="space-y-3">{paperId && <Link className="flex items-center gap-1 text-sm text-slate-500" href="/papers"><ArrowLeft className="size-4" />返回我的套卷</Link>}
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-semibold tracking-tight text-[32px]">{paper?.title || "套卷复习"}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{paperId ? "先快速分类，再选择需要的题目生成完整解析。" : "上传整卷或整页，选择全卷或指定题号，建立自己的高三复习资料。"}</p></div>
        {paper && <a className="text-sm text-terracotta-800 underline" href={paper.sourceUrl} target="_blank" rel="noreferrer">查看原试卷</a>}</div>
    </header>
    {error && <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">{error}</div>}
    {message && <p role="status" className="rounded-xl bg-terracotta-50 p-4 text-sm leading-6 text-terracotta-900">{message}</p>}
    {busy && <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-terracotta-200 bg-white p-4 text-sm"><LoaderCircle className="size-4 animate-spin text-terracotta-700" />{busy}{cancellable && <Button variant="outline" size="sm" onClick={() => void stop()}>停止</Button>}{running && <span className="text-slate-500">每完成一题即保存，可随时停止。</span>}</div>}
    {loading && !busy && <p className="text-sm text-slate-500">正在读取套卷…</p>}
    {paperId && <Link href={`/papers/${paperId}/solutions`} className="inline-block rounded-lg border border-terracotta-200 bg-white px-4 py-3 text-sm text-terracotta-800">配套解析审核 · 匹配、解法评审与通法 →</Link>}
    {!paperId && <>
      <section className="surface-card space-y-4 p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><FileUp className="size-5 text-terracotta-700" />上传试卷</h2>
        <p className="text-sm leading-6 text-slate-500">支持 PDF、JPG、PNG，文件不超过 40MB，PDF 最多 80 页。文字版优先按题号定位，扫描版可用 AI 定位或手动框选。</p>
        <div className="grid gap-3 sm:grid-cols-2"><input aria-label="套卷名称" placeholder="套卷名称（可选）" className={inputClass} value={title} onChange={e => setTitle(e.target.value)} disabled={blocked} />
          <input aria-label="上传试卷文件" className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-terracotta-50 file:px-3 file:py-1 file:text-terracotta-800`} type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" disabled={blocked} onChange={e => { setFile(e.target.files?.[0] || null); setError(""); }} /></div>
        <label className="block space-y-2 text-sm"><span>配套解析文件（选填，PDF）</span><input aria-label="配套解析文件" className={inputClass} type="file" accept="application/pdf,.pdf" disabled={blocked} onChange={e => setSolutionFile(e.target.files?.[0] || null)} /></label>
        <p className="text-xs text-slate-500">不选解析时沿用原流程；选择后关联同一导入批次，保存试卷裁切后进入配套解析审核。</p>
        <Button onClick={upload} disabled={blocked || !file}><FileUp className="size-4" />{solutionFile ? '联合上传并选择题目' : '仅上传试卷并选择题目'}</Button>
      </section>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="套卷概览"><WorkspaceMetric label="我的套卷" value={loading ? "—" : papers.length} note="独立保存的整卷与整页材料" /><WorkspaceMetric label="待解析题目" value={loading ? "—" : papers.reduce((n,p) => n + Math.max(0,p.questionCount - p.completedCount),0)} note="已选题中尚未保存解析的题目" /><WorkspaceMetric label="解析已保存" value={loading ? "—" : papers.reduce((n,p) => n + p.completedCount,0)} note="解析完成不代表学生已经掌握" /></section>
      <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">我的套卷</h2><div className="flex flex-wrap gap-2"><input aria-label="搜索套卷" placeholder="搜索套卷或文件名…" className={inputClass} value={paperQuery} onChange={e => setPaperQuery(e.target.value)} /><select aria-label="筛选套卷解析状态" className={inputClass} value={paperStatus} onChange={e => setPaperStatus(e.target.value)}><option value="">全部状态</option><option value="pending">待解析</option><option value="complete">解析已完成</option></select></div></div>
      {!loading && !papers.length && <div className="surface-card p-10 text-center"><FileUp className="mx-auto size-8 text-terracotta-800" /><h3 className="mt-4 font-semibold">建立你的第一份复习材料</h3><p className="mt-2 text-sm text-slate-500">在上方上传试卷，选取题目、检查裁切，再逐题保存解析。</p></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{papers.filter(p => (p.title + p.originalFilename).toLowerCase().includes(paperQuery.toLowerCase()) && (!paperStatus || (paperStatus === "complete" ? p.questionCount > 0 && p.completedCount >= p.questionCount : !p.questionCount || p.completedCount < p.questionCount))).map(item => <Link key={item.id} href={`/papers/${item.id}`} className="surface-card group overflow-hidden transition-colors hover:border-terracotta-400"><div className="flex h-28 items-center justify-between border-b border-slate-100 bg-[var(--color-brand-primary-soft)] px-6"><FileText className="size-10 text-terracotta-900/60" strokeWidth={1.2} /><span className="rounded-md border border-white bg-white/80 px-2 py-1 text-[10px] font-semibold text-slate-500">{item.sourceType === "application/pdf" ? "PDF 试卷" : "图片试卷"}</span></div><div className="space-y-4 p-5"><div><h3 className="truncate text-base font-semibold">{item.title}</h3><p className="mt-1 truncate text-xs text-slate-400">{item.originalFilename}</p></div><div><div className="mb-2 flex justify-between text-xs text-slate-500"><span>解析已保存 {item.completedCount} / {item.questionCount}</span><span>{item.questionCount ? Math.round(item.completedCount / item.questionCount * 100) + "%" : "待选题"}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-terracotta-800" style={{width:(item.questionCount ? Math.min(100,item.completedCount / item.questionCount * 100) : 0) + "%"}} /></div></div><div className="flex justify-between border-t border-slate-100 pt-4 text-xs"><span className="text-slate-400">{new Date(item.createdAt).toLocaleDateString("zh-CN")}</span><span className="font-semibold text-terracotta-800">继续复习 →</span></div></div></Link>)}</div>
      {!loading && papers.length > 0 && !papers.some(p => (p.title + p.originalFilename).toLowerCase().includes(paperQuery.toLowerCase()) && (!paperStatus || (paperStatus === "complete" ? p.questionCount > 0 && p.completedCount >= p.questionCount : !p.questionCount || p.completedCount < p.questionCount))) && <p className="surface-card p-8 text-center text-sm text-slate-500">暂无匹配套卷，请调整搜索或状态筛选。</p>}
      </section>
    </>}
    {paper && <>
      <div className="surface-card flex flex-wrap items-center gap-3 p-4"><label className="text-sm">学段 <select aria-label="套卷学段" className={`${inputClass} ml-2`} value={stage} disabled={blocked} onChange={e => setStage(e.target.value)}><option>高中</option><option>初中</option></select></label>
        <span className="text-sm text-slate-500">已保存 {questions.length} 道题 · {questions.filter(q => q.classification).length} 道已分类 · {questions.filter(q => q.explanation).length} 道解析</span>
        {!preparing && <Button variant="outline" size="sm" disabled={blocked} onClick={() => prepare(paper)}><Scissors className="size-4" />继续选题 / 手动裁切</Button>}
      </div>
      {(preparing || questions.length > 0) && <div className="surface-card space-y-3 p-4"><div className="flex flex-wrap items-center gap-3"><label className="text-sm">指定题号 <input aria-label="指定题号" placeholder="如 1,3,7-10,17；留空选择全部" className={`${inputClass} ml-2 w-72 max-w-full`} value={selection} disabled={blocked} onChange={e => setSelection(e.target.value)} /></label><Button variant="outline" size="sm" onClick={selectNumbers} disabled={blocked}>按题号选择</Button>
        <Button variant="outline" size="sm" disabled={blocked} onClick={() => preparing ? setSelectedCrops([...available]) : setSelectedQuestions([...available])}>全选</Button><Button variant="outline" size="sm" disabled={blocked} onClick={() => preparing ? setSelectedCrops([]) : setSelectedQuestions([])}>清空选择</Button><span className="text-sm text-terracotta-800">已选 {selected.length} 题</span></div>
        <p className="text-xs leading-5 text-slate-500">支持逗号和连续范围。不会把未找到的题号当作已处理；重复上传同一份试卷会打开已有资料。</p></div>}
      {preparing && doc && <>
        <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">检查题目裁切</h2><p className="mt-1 text-sm text-slate-500">共 {doc.pages.length} 页，定位到 {crops.length} 道题。题号和边界可调整，支持跨页拼接。</p></div>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={blocked} onClick={detectWithAI}><Sparkles className="size-4" />AI 定位题号</Button><Button variant="outline" size="sm" disabled={blocked} onClick={() => setEditingCrop({ index: -1, crop: { number: Math.max(0, ...crops.map(c => c.number)) + 1, text: "", regions: [{ page: 1, x: .02, y: .05, width: .96, height: .3 }] } })}>手动添加题目</Button></div></div>
          {editingCrop && <PaperCropEditor key={`${editingCrop.index}-${editingCrop.crop.number}`} doc={doc} crop={editingCrop.crop} onClose={() => setEditingCrop(null)} onApply={crop => {
            if (crops.some((c, i) => c.number === crop.number && i !== editingCrop.index)) { setError("此题号已经存在，请使用不同题号。"); return; }
            const previous = crops[editingCrop.index]?.number;
            if (questions.some(q => q.number === crop.number)) setEditedNumbers(current => [...new Set([...current, crop.number])]);
            setCrops(current => editingCrop.index < 0 ? [...current, crop].sort((a, b) => a.number - b.number) : current.map((c, i) => i === editingCrop.index ? crop : c).sort((a, b) => a.number - b.number));
            setSelectedCrops(current => [...new Set([...current.filter(n => n !== previous), crop.number])]); setEditingCrop(null); setError("");
          }} />}
          {!crops.length && <div className="surface-card p-6 text-sm leading-6 text-slate-500">这份文件没有可直接定位的题号文字。点击“AI 定位题号”，或手动添加题目并在页面上框选。</div>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{crops.map((crop, index) => <article className={`surface-card overflow-hidden ${selectedCrops.includes(crop.number) ? "ring-1 ring-terracotta-500" : ""}`} key={crop.number}><div className="flex items-center justify-between border-b p-3"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={selectedCrops.includes(crop.number)} disabled={blocked} onChange={() => toggle(crop.number)} />第 {crop.number} 题</label><Button variant="outline" size="sm" disabled={blocked} onClick={() => setEditingCrop({ crop, index })}>调整裁切</Button></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {previewUrls[crop.number] ? <a href={previewUrls[crop.number]} target="_blank" rel="noreferrer"><img alt={`第 ${crop.number} 题裁切预览`} src={previewUrls[crop.number]} className="max-h-80 w-full bg-white object-contain" /></a> : <div className="p-8 text-center text-sm text-slate-400">正在生成预览…</div>}
            <p className="p-3 text-xs text-slate-500">第 {[...new Set(crop.regions.map(r => r.page))].join("、")} 页 · {crop.regions.length > 1 ? `${crop.regions.length} 个片段拼接` : "单页题目"}{questions.some(q => q.number === crop.number) ? " · 已入库，会保留已有题目" : ""}</p>
          </article>)}</div>
          <div className="sticky bottom-3 flex flex-wrap gap-3 rounded-xl border border-terracotta-100 bg-white/95 p-4 shadow-lg"><Button disabled={blocked || !selectedCrops.length || !!editingCrop} onClick={() => saveCrops(true)}><Sparkles className="size-4" />确认裁切并快速分类 {selectedCrops.length} 题</Button><Button variant="outline" disabled={blocked || !selectedCrops.length || !!editingCrop} onClick={() => saveCrops(false)}>仅保存所选题目</Button>{questions.length > 0 && <Button variant="outline" disabled={blocked} onClick={() => setPreparing(false)}>返回已保存题目</Button>}</div>
        </section>
      </>}
      {!preparing && questions.length > 0 && <>
        <PaperArchive key={`${paper.id}:${selectedQuestions.join(',')}:${questions.map(q => q.revision).join(',')}`} paperId={paper.id} questions={questions.filter(q => selectedQuestions.includes(q.number))} disabled={blocked} />
        <div className="space-y-2"><div className="flex flex-wrap gap-3"><Button disabled={blocked || !selectedQuestions.length} onClick={() => run(questions.filter(q => selectedQuestions.includes(q.number)))}><Sparkles className="size-4" />快速分类所选题目</Button><Button variant="outline" disabled={blocked || questions.every(q => q.classification?.education_stage === stage && !q.error && q.status !== 'processing')} onClick={() => run(questions.filter(q => q.classification?.education_stage !== stage || !!q.error || q.status === 'processing'))}>分类全部未分类题目</Button><Button variant="outline" disabled={blocked || !selectedQuestions.length} onClick={() => run(questions.filter(q => selectedQuestions.includes(q.number)), false, 'explain')}>生成所选题目的完整解析</Button></div><p className="text-xs leading-6 text-slate-500">快速分类仅识别题干、章节、知识点、题型和难度，不生成答案与步骤。完整解析由你另行选择；分类仍需调用 AI API，已有分类会复用。</p></div>
        <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="surface-card space-y-1 p-3 lg:sticky lg:top-6"><h2 className="px-2 py-2 font-semibold">套卷题目</h2>{questions.map(q => <div key={q.id} className={`flex items-center gap-2 rounded-lg p-2 ${activeQuestionId === q.id ? "bg-terracotta-50" : ""}`}><input aria-label={`选择第 ${q.number} 题`} type="checkbox" checked={selectedQuestions.includes(q.number)} disabled={blocked} onChange={() => toggle(q.number)} /><button className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1 text-left text-sm" onClick={() => setActiveQuestionId(q.id)}><span>第 {q.number} 题</span><span className={`text-xs ${q.explanation ? "text-terracotta-800" : q.status === "failed" ? "text-amber-700" : "text-slate-500"}`}>{statusLabel(q)}</span></button></div>)}</aside>
          {active && <article className="surface-card min-w-0 space-y-6 p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">第 {active.number} 题</h2><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={blocked} onClick={() => run([active], !!active.classification)}>{active.classification ? "重新分类此题" : "快速分类此题"}</Button><Button variant="outline" size="sm" disabled={blocked} onClick={() => run([active], !!active.explanation, 'explain')}>{active.explanation ? "重新生成此题解析" : "生成此题完整解析"}</Button></div></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <a href={active.imageUrl} target="_blank" rel="noreferrer"><img alt={`第 ${active.number} 题原图`} src={active.imageUrl} className="max-h-[500px] w-full rounded-lg border bg-white object-contain" /></a>
            {active.error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{active.error}</p>}
            {active.classification && <div className="space-y-2"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-100 px-3 py-1">{active.classification.chapter.name}</span>{active.classification.knowledge_points.map(k => <span className="rounded-full bg-terracotta-50 px-3 py-1 text-terracotta-800" key={k.code}>{k.name}</span>)}<span className="rounded-full bg-slate-100 px-3 py-1">{active.classification.question_type}</span><span className="rounded-full bg-slate-100 px-3 py-1">难度：{active.classification.difficulty}</span><span className="px-2 py-1 text-slate-400">AI 分类建议{active.classification.needs_review ? ' · 需核对' : ''}</span></div><p className="text-xs leading-6 text-slate-500">{active.classification.classification_notes}</p></div>}
            {active.questionText && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm text-slate-600">题目原文</summary><MathText className="mt-3 whitespace-pre-wrap text-sm leading-7">{active.questionText}</MathText></details>}
            {active.explanation ? <><p className="flex items-center gap-2 text-xs text-terracotta-800"><Check className="size-4" />解析已保存 · {active.explanation.model} · {new Date(active.explanation.updatedAt).toLocaleString("zh-CN")}</p>
              <p className="text-xs leading-5 text-slate-500">AI 辅助解析，复习时请对照原题核对条件、答案和步骤。</p>
              {active.explanation.content.status === "needs_context" && <div className="rounded-lg bg-amber-50 p-4"><h3 className="font-semibold">需要补充题目信息</h3><MathText className="mt-2 text-sm leading-7">{active.explanation.content.missingInformation}</MathText></div>}
              {active.explanation.content.answer && <div className="rounded-xl bg-terracotta-50 p-4"><h3 className="text-sm font-semibold text-terracotta-800">答案</h3><MathText className="mt-2 leading-8">{active.explanation.content.answer}</MathText></div>}
              {active.explanation.content.approach && <div><h3 className="font-semibold">解题思路</h3><MathText className="mt-2 whitespace-pre-wrap text-sm leading-7">{active.explanation.content.approach}</MathText></div>}
              <div><h3 className="font-semibold">详细步骤</h3><ol className="mt-4 space-y-5">{active.explanation.content.steps.map((step, i) => <li className="flex gap-3" key={i}><span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-terracotta-50 text-xs text-terracotta-800">{i + 1}</span><div className="min-w-0 flex-1"><MathText className="font-medium">{step.title}</MathText><MathText className="mt-1 whitespace-pre-wrap text-sm leading-7">{step.content}</MathText></div></li>)}</ol></div>
              {([['teachingNotes', '讲解提示'], ['commonMistakes', '易错点'], ['verification', '结果核验'], ['alternativeMethod', '另一种解法']] as const).map(([key, label]) => active.explanation!.content[key] && <details className="rounded-lg border p-3" key={key}><summary className="cursor-pointer text-sm font-medium">{label}</summary><MathText className="mt-3 whitespace-pre-wrap text-sm leading-7">{active.explanation!.content[key]}</MathText></details>)}
            </> : <div className="rounded-xl border border-dashed p-6 text-center text-sm leading-6 text-slate-500">{active.status === "processing" ? "正在处理此题，结果完成后自动保存。" : active.classification ? "分类已保存，尚未生成完整解析。需要讲解时再点击“生成此题完整解析”。" : "题目已保存，先快速分类，再决定哪些题需要完整解析。"}</div>}
          </article>}
        </div>
      </>}
    </>}
  </div>;
}

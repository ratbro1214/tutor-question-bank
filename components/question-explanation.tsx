"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, LoaderCircle, Pencil, Plus, Save, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/math-text";
import { emptyExplanation, explanationContentSchema, type ExplanationContent, type SavedExplanation } from "@/lib/question-explanation";
import { explanationDraftKey, readExplanationDraft } from "@/lib/explanation-draft";

const textareaClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-7 outline-none focus:border-terracotta-600 focus:ring-2 focus:ring-terracotta-100 disabled:opacity-60";
const textClass = "whitespace-pre-wrap break-words text-sm leading-7 text-slate-700";

export function QuestionExplanation({ studentId, questionId, questionText, apiEndpoint }: { studentId: string; questionId: number; questionText: string; apiEndpoint?: string }) {
  const endpoint = apiEndpoint || `/api/questions/${questionId}/explanation`;
  const [draft, setDraft] = useState<ExplanationContent | null>(null);
  const [sourceText, setSourceText] = useState(questionText);
  const [saved, setSaved] = useState<SavedExplanation | null>(null);
  const [origin, setOrigin] = useState<"ai" | "manual">("manual");
  const [model, setModel] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const storageKey = apiEndpoint ? `canonical-explanation:${apiEndpoint}` : explanationDraftKey(studentId, questionId);
  const controller = useRef<AbortController | null>(null);
  const initialText = useRef(questionText);
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const response = await fetch(`${endpoint}${endpoint.includes('?')?'&':'?'}studentId=${encodeURIComponent(studentId)}`, { cache: "no-store", signal: abort.signal });
        const data = await response.json() as { explanation: SavedExplanation | null; error?: string };
        if (!response.ok) throw Error(data.error || "解析加载失败。");
        if (abort.signal.aborted) return;
        setSaved(data.explanation); setDraft(data.explanation?.content || null);
        setSourceText(data.explanation?.sourceText || initialText.current);
        setOrigin(data.explanation?.origin === 'external' ? 'manual' : data.explanation?.origin || "manual"); setModel(data.explanation?.model || "");
        setReviewed(data.explanation?.reviewed || false); setLoaded(true); setDirty(false);
        setSaveBlocked(false);
        let backup = null;
        try { backup = readExplanationDraft(localStorage.getItem(storageKey)); } catch { /* Server persistence works with storage disabled. */ }
        if (backup) {
          setDraft(backup.content); setSourceText(backup.sourceText); setOrigin(backup.origin); setModel(backup.model);
          setReviewed(backup.reviewed); setDirty(true); setEditing(true);
          if (backup.baseRevision !== (data.explanation?.revision || 0)) {
            setSaveBlocked(true); setError("已恢复本机草稿，但服务器有更新版本。请复制要保留的内容，再读取服务器版本。");
          } else setMessage("已恢复上次未完成的编辑，完整内容会自动保存。");
        }
      } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "解析加载失败。"); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }
    void load();
    return () => { abort.abort(); controller.current?.abort(); };
  }, [endpoint, studentId, reload, storageKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      if (dirty && draft) localStorage.setItem(storageKey, JSON.stringify({ content: draft, sourceText, origin, model, reviewed, baseRevision: saved?.revision || 0 }));
      else localStorage.removeItem(storageKey);
    } catch { /* Do not fail editing when local storage is disabled. */ }
  }, [loaded, dirty, draft, sourceText, origin, model, reviewed, saved, storageKey]);
  useEffect(() => {
    if (!dirty || !draft || generating || saving || saveBlocked || error || !sourceText.trim() || !explanationContentSchema.safeParse(draft).success) return;
    const timer = setTimeout(() => { void save(true); }, 1200);
    return () => clearTimeout(timer);
    // Each edited value restarts the timer; save reads that snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draft, sourceText, origin, model, reviewed, generating, saving, saveBlocked, error]);
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const busy = generating || saving;
  const hasContent = !!draft && (!!draft.answer || !!draft.approach || draft.steps.length > 0 || draft.status === "needs_context");
  function change(values: Partial<ExplanationContent>) {
    setDraft((current) => ({ ...(current || structuredClone(emptyExplanation)), ...values }));
    setDirty(true); setReviewed(false); setMessage("");
    if (!saveBlocked) setError("");
  }
  async function generate() {
    if (!sourceText.trim()) { setError("请先填写完整题目原文。"); setEditing(true); return; }
    const abort = new AbortController(); controller.current = abort;
    setGenerating(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: Number(studentId), questionText: sourceText, expectedRevision: saved?.revision || 0 }), signal: abort.signal });
      const data = await response.json() as { content: ExplanationContent; sourceText: string; model: string; explanation?: SavedExplanation; error?: string };
      if (response.status === 409 && data.content) {
        setDraft(data.content); setSourceText(data.sourceText); setOrigin("ai"); setModel(data.model); setReviewed(false); setDirty(true); setSaveBlocked(true);
      }
      if (!response.ok) throw Error(data.error || "生成失败，请稍后重试。");
      if (abort.signal.aborted) return;
      setDraft(data.content); setSourceText(data.sourceText); setOrigin("ai"); setModel(data.model);
      if (!data.explanation) throw Error("解析未确认保存，请稍后重新读取。");
      setSaved(data.explanation); setReviewed(false); setDirty(false); setEditing(false);
      setMessage(data.content.status === "needs_context" ? "解析已自动保存；还需要补充题目信息，请查看下面的说明。" : "解析已生成并自动保存，刷新或离开页面后仍可查看。");
    } catch (reason) {
      if (abort.signal.aborted) setMessage("已取消生成，原有内容保留。");
      else setError(reason instanceof Error ? reason.message : "生成失败，原有内容保留。");
    } finally { if (controller.current === abort) { setGenerating(false); controller.current = null; } }
  }
  async function save(automatic = false) {
    const parsed = explanationContentSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "请补全解析。"); setEditing(true); return; }
    if (!sourceText.trim()) { setError("请填写解析对应的题目原文。"); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        studentId: Number(studentId), expectedRevision: saved?.revision || 0, sourceText, content: parsed.data, reviewed, origin, model,
      }) });
      const data = await response.json() as { explanation: SavedExplanation; error?: string };
      if (response.status === 409) setSaveBlocked(true);
      if (!response.ok) throw Error(data.error || "解析保存失败，当前输入保留。");
      setSaved(data.explanation); setDraft(data.explanation.content); setDirty(false); if (!automatic) setEditing(false);
      setMessage(reviewed ? "已保存教师核对的解析。" : "解析已自动保存。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败，当前输入保留。"); }
    finally { setSaving(false); }
  }
  function manuallyEdit() { if (!draft) { setDraft(structuredClone(emptyExplanation)); setOrigin("manual"); } setEditing(true); }
  function readServerVersion() {
    try { localStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
    setLoaded(false); setDirty(false); setSaveBlocked(false); setReload(value => value + 1);
  }

  return <section className="surface-card overflow-hidden" aria-label="题目详解">
    <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2"><BookOpen className="size-5 text-terracotta-700" /><h2 className="text-xl font-semibold">题目详解</h2></div>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">看答案、理思路，也看看这道题怎么讲。</p>
      {!loading && loaded && <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={generate} disabled={busy || dirty || saveBlocked || !sourceText.trim()} size="sm"><Sparkles className="size-4" />{generating ? "正在解题…" : hasContent ? "重新生成解析" : "生成题目详解"}</Button>
        <Button variant="outline" size="sm" onClick={() => editing ? setEditing(false) : manuallyEdit()} disabled={busy}><Pencil className="size-4" />{editing ? "预览解析" : hasContent ? "修改解析" : "手工填写"}</Button>
        {dirty && draft && <Button size="sm" variant="outline" onClick={() => void save()} disabled={busy}><Save className="size-4" />{saving ? "保存中…" : "保存解析"}</Button>}
      </div>}
      {hasContent && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className={`rounded-full px-2.5 py-1 ${reviewed ? "bg-terracotta-50 text-terracotta-800" : "bg-amber-50 text-amber-800"}`}>{reviewed ? "教师已核对" : "待教师核对"}</span>
        <span>{saved?.origin === 'external' && !dirty ? '来源参考解析' : origin === "ai" ? "AI 辅助解析" : "教师编写"}</span>
        <span>{dirty ? "尚未保存" : "已保存"}</span>
      </div>}
    </div>
    <div className="space-y-5 px-5 py-5 sm:px-6">
      {loading && <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />正在读取解析…</p>}
      {error && <div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">{error}{!loaded && !loading && <button className="ml-2 underline" onClick={() => setReload((value) => value + 1)}>重新读取</button>}</div>}
      {saveBlocked && <button className="text-sm text-terracotta-800 underline" onClick={readServerVersion}>已复制需要保留的内容，读取服务器版本</button>}
      {message && <p role="status" className="text-sm leading-6 text-terracotta-800">{message}</p>}
      {generating && <div role="status" className="rounded-xl bg-terracotta-50 p-4 text-sm leading-6 text-terracotta-900"><div className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />正在分析原图、推导步骤并检查答案…</div><p className="mt-1 text-terracotta-800">复杂题可能需要几分钟，最多等待 5 分钟，请保持页面打开。</p><button className="mt-2 text-xs underline" onClick={() => controller.current?.abort()}>取消本次生成</button></div>}
      {!loading && loaded && <details className="rounded-xl border border-slate-200 p-3" open={editing || (!hasContent && !apiEndpoint)}>
        <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-slate-600">核对题目原文<ChevronDown className="size-4" /></summary>
        <textarea aria-label="解析对应的题目原文" className={`${textareaClass} mt-3`} rows={4} maxLength={16000} value={sourceText} disabled={busy} onChange={(event) => { setSourceText(event.target.value); setReviewed(false); if (draft) setDirty(true); setMessage(""); }} />
        <p className="mt-2 text-xs leading-5 text-slate-500">可修正识别错误。生成时会同时核对原图；这里的修改随解析保存。</p>
      </details>}
      {!loading && loaded && !hasContent && !editing && !generating && <div className="rounded-xl border border-dashed border-terracotta-200 bg-terracotta-50/40 px-4 py-6 text-center"><BookOpen className="mx-auto mb-3 size-7 text-terracotta-700" /><p className="font-medium text-slate-800">为这道题补一份备课解析</p><p className="mt-2 text-sm leading-6 text-slate-500">生成答案、详细步骤、讲解提示和易错点，<br />也可以直接填写自己的解法。</p></div>}
      {saved && saved.sourceText.trim() !== questionText.trim() && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">已保存解析使用的题干与当前题目原文不同，请核对条件后决定是否重新生成。</p>}
      {draft && editing ? <div className="space-y-4">
        <p className="text-xs leading-6 text-slate-500">文字可直接修改，公式支持标准数学写法。点击“预览解析”查看排版效果。</p>
        {draft.status === "needs_context" && <label className="block text-sm font-medium">需要补充的信息<textarea className={`${textareaClass} mt-2`} rows={3} maxLength={2000} value={draft.missingInformation} disabled={busy} onChange={(event) => change({ missingInformation: event.target.value })} /></label>}
        <label className="block text-sm font-medium">答案<textarea aria-label="解析答案" className={`${textareaClass} mt-2`} rows={2} maxLength={6000} value={draft.answer} disabled={busy} onChange={(event) => change({ answer: event.target.value })} /></label>
        <label className="block text-sm font-medium">解题思路<textarea aria-label="解题思路" className={`${textareaClass} mt-2`} rows={3} maxLength={6000} value={draft.approach} disabled={busy} onChange={(event) => change({ approach: event.target.value })} /></label>
        <div className="space-y-3"><h3 className="text-sm font-semibold">详细步骤</h3>{draft.steps.map((step, index) => <div className="space-y-2 rounded-xl border border-slate-200 p-3" key={index}>
          <div className="flex gap-2"><input aria-label={`第 ${index + 1} 步标题`} className={textareaClass} maxLength={120} value={step.title} disabled={busy} onChange={(event) => change({ steps: draft.steps.map((item, i) => i === index ? { ...item, title: event.target.value } : item) })} /><button type="button" aria-label={`删除第 ${index + 1} 步`} disabled={busy} onClick={() => change({ steps: draft.steps.filter((_, i) => i !== index) })}><X className="size-4 text-slate-500" /></button></div>
          <textarea aria-label={`第 ${index + 1} 步内容`} className={textareaClass} rows={4} maxLength={6000} value={step.content} disabled={busy} onChange={(event) => change({ steps: draft.steps.map((item, i) => i === index ? { ...item, content: event.target.value } : item) })} />
        </div>)}<Button variant="outline" size="sm" disabled={busy || draft.steps.length >= 16} onClick={() => change({ steps: [...draft.steps, { title: `第 ${draft.steps.length + 1} 步`, content: "" }] })}><Plus className="size-4" />添加步骤</Button></div>
        {([ ["teachingNotes", "老师怎么讲"], ["commonMistakes", "易错点"], ["verification", "结果核验"], ["alternativeMethod", "另一种解法（可选）"] ] as const).map(([key, label]) => <label className="block text-sm font-medium" key={key}>{label}<textarea aria-label={label} className={`${textareaClass} mt-2`} rows={3} maxLength={6000} value={draft[key]} disabled={busy} onChange={(event) => change({ [key]: event.target.value })} /></label>)}
        {draft.status === "needs_context" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} onChange={(event) => { if (event.target.checked) change({ status: "ready", missingInformation: "" }); }} />我已补齐条件，并填写了完整解法</label>}
      </div> : draft && hasContent && <div className="space-y-6">
        {draft.status === "needs_context" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold text-amber-900">还需要补充题目信息</h3><MathText className={`${textClass} mt-2`}>{draft.missingInformation}</MathText></div>}
        {draft.answer && <div className="rounded-xl border border-terracotta-100 bg-terracotta-50 p-4"><h3 className="text-sm font-semibold text-terracotta-800">答案</h3><MathText className="mt-2 text-base font-medium leading-8 text-terracotta-950">{draft.answer}</MathText></div>}
        {draft.approach && <div><h3 className="mb-2 font-semibold text-slate-900">解题思路</h3><MathText className={textClass}>{draft.approach}</MathText></div>}
        {!!draft.steps.length && <div><h3 className="mb-4 font-semibold text-slate-900">详细步骤</h3><ol className="space-y-5">{draft.steps.map((step, index) => <li className="flex gap-3" key={index}><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-terracotta-50 text-xs font-semibold text-terracotta-800">{index + 1}</span><div className="min-w-0 flex-1"><MathText className="mb-1 text-sm font-semibold text-slate-900">{step.title}</MathText><MathText className={textClass}>{step.content}</MathText></div></li>)}</ol></div>}
        {draft.teachingNotes && <div className="rounded-xl bg-slate-50 p-4"><h3 className="mb-2 text-sm font-semibold text-slate-900">老师怎么讲</h3><MathText className={textClass}>{draft.teachingNotes}</MathText></div>}
        {draft.commonMistakes && <div><h3 className="mb-2 text-sm font-semibold text-slate-900">易错点</h3><MathText className={textClass}>{draft.commonMistakes}</MathText></div>}
        {draft.verification && <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">结果核验</summary><MathText className={`${textClass} mt-3`}>{draft.verification}</MathText></details>}
        {draft.alternativeMethod && <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">另一种解法</summary><MathText className={`${textClass} mt-3`}>{draft.alternativeMethod}</MathText></details>}
      </div>}
      {draft && hasContent && <div className="space-y-3 border-t border-slate-100 pt-4">
        <label className="flex items-start gap-2 text-sm leading-6 text-slate-600"><input className="mt-1.5 accent-terracotta-700" type="checkbox" checked={reviewed} disabled={busy || draft.status !== "ready"} onChange={(event) => { setReviewed(event.target.checked); setDirty(true); setMessage(""); }} />我已核对题目条件、答案和解题步骤</label>
        <Button className="w-full" disabled={busy || !dirty} onClick={() => void save()}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : dirty ? <Save className="size-4" /> : <Check className="size-4" />}{saving ? "保存中…" : dirty ? "保存解析" : "解析已保存"}</Button>
        {saved && !dirty && <p className="text-center text-xs text-slate-400">更新于 {new Date(saved.updatedAt).toLocaleString("zh-CN")}</p>}
      </div>}
    </div>
  </section>;
}

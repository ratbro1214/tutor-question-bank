"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { interventionProgress, type InterventionPlan } from "@/lib/interventions";
import { errorPatternByCode, correctnessOptions, supportLevels, type LearningEvent } from "@/lib/learning";
import { EvidenceTrail } from "@/components/evidence-trail";
const localTime = (days = 0) => { const d = new Date(Date.now() + days * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 23); };
const inputClass = "w-full rounded-lg border p-2 text-sm";
export function InterventionPanel({ studentId, events, onRecorded }: { studentId: string; events: LearningEvent[]; onRecorded: () => Promise<void> }) {
  const [plans, setPlans] = useState<InterventionPlan[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [goal, setGoal] = useState("");
  const [strategy, setStrategy] = useState("");
  const [instruction, setInstruction] = useState("");
  const [due, setDue] = useState(() => localTime(7));
  const sourceOptions = events.filter((e) => e.kind === "attempt" && e.correctness !== "正确" && e.inquiryId && e.errorCode && ["教师确认", "教师修正"].includes(e.teacherDecision || ""));
  const createId = useRef(crypto.randomUUID());
  const createSignature = useRef("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const r = await fetch(`/api/students/${studentId}/agent/interventions`, { cache: "no-store", signal });
    const data = await r.json() as { plans: InterventionPlan[]; error?: string };
    if (!r.ok) throw new Error(data.error || "干预计划加载失败。");
    if (!signal?.aborted) setPlans(data.plans);
  }, [studentId]);
  useEffect(() => { const c = new AbortController(); void Promise.resolve().then(() => load(c.signal)).catch((e) => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [load]);
  async function send(method: string, body: unknown) {
    setBusy(true); setError(""); setMessage("");
    try { const r = await fetch(`/api/students/${studentId}/agent/interventions`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await r.json() as { error?: string }; if (!r.ok) throw new Error(data.error); await load(); await onRecorded(); setMessage("已保存，计划与真实记录分别保留。"); return true; } catch (e) { setError(e instanceof Error ? e.message : "保存失败。"); return false; } finally { setBusy(false); }
  }
  async function create() {
    const content = { sourceAttemptId: sourceId, goal, strategy, checkInstruction: instruction, dueAt: new Date(due).toISOString() };
    const signature = JSON.stringify(content);
    if (createSignature.current && createSignature.current !== signature) createId.current = crypto.randomUUID();
    createSignature.current = signature;
    if (await send("POST", { id: createId.current, ...content })) { createId.current = crypto.randomUUID(); setSourceId(""); }
  }
  return <section className="space-y-4 rounded-xl border border-terracotta-200 bg-white p-4">
    <h3 className="font-semibold text-terracotta-950">教学干预闭环</h3><p className="text-sm text-slate-600">先核对具体错因，保存教学计划；实施后分别记录新题的独立检测和到期复查。计划和讲解本身不等于学生已经改善。</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{message && <p role="status" className="text-sm text-terracotta-700">{message}</p>}
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">建立干预计划</summary>
      {!sourceOptions.length ? <p className="mt-3 text-sm text-slate-500">先在题目页记录真实错误作答，并由教师确认具体错误模式。</p> : <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label className="block text-sm">原始错因证据<select required aria-label="干预原始作答" className={inputClass} value={sourceId} onChange={(e) => { const source = sourceOptions.find((s) => s.id === e.target.value); setSourceId(e.target.value); const pattern = errorPatternByCode(source?.errorCode || ""); setGoal(source ? `验证并改善“${source.errorLabel}”` : ""); setStrategy(pattern?.intervention || ""); setInstruction(pattern?.check || ""); }}><option value="">选择教师确认的作答</option>{sourceOptions.map((s) => <option key={s.id} value={s.id}>题目 #{s.questionId} · {s.errorLabel} · {s.occurredAt.slice(0, 10)}</option>)}</select></label>
        <label className="block text-sm">本轮目标<input required aria-label="干预目标" maxLength={1000} className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
        <label className="block text-sm">教学策略<textarea required aria-label="干预策略" maxLength={2000} className={inputClass} value={strategy} onChange={(e) => setStrategy(e.target.value)} /></label>
        <label className="block text-sm">检测要求<textarea required aria-label="干预检测要求" maxLength={1000} className={inputClass} value={instruction} onChange={(e) => setInstruction(e.target.value)} /></label>
        <label className="block text-sm">间隔复查时间<input required aria-label="干预复查时间" type="datetime-local" step="0.001" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <button disabled={busy} className="rounded-lg bg-terracotta-700 px-4 py-2 text-sm text-white">保存干预计划</button>
      </form>}
    </details>
    {!plans.length && <p className="text-sm text-slate-500">尚无干预计划。</p>}
    {plans.map((plan) => <InterventionCard key={`${plan.id}:${plan.status}`} plan={plan} events={events} studentId={studentId} busy={busy} send={send} onRecorded={async () => { await load(); await onRecorded(); }} />)}
  </section>;
}
function InterventionCard({ plan, events, studentId, busy, send, onRecorded }: { plan: InterventionPlan; events: LearningEvent[]; studentId: string; busy: boolean; send: (method: string, body: unknown) => Promise<boolean>; onRecorded: () => Promise<void> }) {
  const progress = interventionProgress(plan, events);
  const source = events.find((e) => e.id === plan.sourceAttemptId);
  const [notes, setNotes] = useState("");
  const [at, setAt] = useState(() => localTime());
  const [stage, setStage] = useState("干预后检测");
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState("");
  const [correctness, setCorrectness] = useState("错误");
  const [support, setSupport] = useState("独立完成");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const token = useRef(crypto.randomUUID()), signature = useRef("");
  async function check() {
    setSaving(true); setError("");
    try {
      const body = { kind: "attempt", questionId: plan.questionId, inquiryId: source?.inquiryId, interventionPlanId: plan.id, targetAttemptId: plan.sourceAttemptId, knowledgePointCode: plan.knowledgePointCode, attemptStage: stage, checkQuestion: question, responseText: response, occurredAt: new Date(at).toISOString(), correctness, supportLevel: support, evidenceLevel: "仅有最终答案", evidenceSource: "课堂观察", notes: "本轮干预检查" };
      const serialized = JSON.stringify(body); if (signature.current && signature.current !== serialized) token.current = crypto.randomUUID(); signature.current = serialized;
      const r = await fetch(`/api/students/${studentId}/learning`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id: token.current }) }); const data = await r.json() as { error?: string }; if (!r.ok) throw new Error(data.error); token.current = crypto.randomUUID(); setQuestion(""); setResponse(""); setAt(localTime()); await onRecorded();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败。"); } finally { setSaving(false); }
  }
  return <article className="space-y-3 rounded-xl border bg-slate-50 p-4">
    <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{plan.goal}</h4><span className="text-sm text-terracotta-800">{progress.status}{progress.overdue ? " · 复查已到期" : ""}</span></div>
    <p className="text-sm">策略：{plan.strategy}</p><p className="text-sm">检测：{plan.checkInstruction}</p><p className="text-xs text-slate-500">题目 #{plan.questionId} · 复查时间 {new Date(plan.dueAt).toLocaleString()}</p>
    <EvidenceTrail studentId={studentId} evidence={progress.evidence} events={events} />
    {plan.status === "planned" && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void send("PATCH", { id: plan.id, action: "implement", occurredAt: new Date(at).toISOString(), notes }); }}>
      <label className="block text-sm">实际实施时间<input required aria-label={`实施时间 ${plan.id}`} type="datetime-local" step="0.001" className={inputClass} value={at} onChange={(e) => setAt(e.target.value)} /></label>
      <textarea required aria-label={`实际干预记录 ${plan.id}`} placeholder="记录实际讲解、学生反应和提供过的提示" maxLength={4000} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-3"><button disabled={busy} className="rounded-lg bg-terracotta-700 px-3 py-2 text-sm text-white">保存实际干预</button><button disabled={busy} type="button" className="text-sm text-slate-500 underline" onClick={() => void send("PATCH", { id: plan.id, action: "cancel" })}>取消未实施计划</button></div>
    </form>}
    {plan.status === "implemented" && <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">记录本轮检测 / 间隔复查</summary>
      <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); void check(); }}>
        <select aria-label={`干预检查阶段 ${plan.id}`} className={inputClass} value={stage} onChange={(e) => setStage(e.target.value)}><option>干预后检测</option><option>间隔复查</option></select>
        <input required type="datetime-local" step="0.001" aria-label={`检查时间 ${plan.id}`} className={inputClass} value={at} onChange={(e) => setAt(e.target.value)} />
        <textarea required maxLength={2000} aria-label={`检测新题 ${plan.id}`} className={inputClass} placeholder="写明本次新题题干，避免把原题记忆当作迁移" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <textarea required maxLength={4000} aria-label={`检测真实作答 ${plan.id}`} className={inputClass} placeholder="学生实际答案或关键步骤" value={response} onChange={(e) => setResponse(e.target.value)} />
        <div className="flex gap-3"><select aria-label={`检查正确性 ${plan.id}`} className={inputClass} value={correctness} onChange={(e) => setCorrectness(e.target.value)}>{correctnessOptions.map((v) => <option key={v}>{v}</option>)}</select><select aria-label={`检查完成方式 ${plan.id}`} className={inputClass} value={support} onChange={(e) => setSupport(e.target.value)}>{supportLevels.map((v) => <option key={v}>{v}</option>)}</select></div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={saving} className="rounded-lg bg-terracotta-700 px-3 py-2 text-sm text-white">保存本轮检查</button>
      </form>
    </details>}
  </article>;
}

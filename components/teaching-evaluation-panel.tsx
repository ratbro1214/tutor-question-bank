"use client";
import { useState } from "react";
import { WorkspaceMetric } from "@/components/workspace-metric";
import { BarChart3, ArrowDownToLine } from "lucide-react";
import { replayScenarios } from "@/lib/evaluation-scenarios";
import { evaluatePolicies, policyNames, replayCheckpoint } from "@/lib/teaching-evaluation";
const report = evaluatePolicies(replayScenarios);
const kinds = { collect_evidence: "收集证据", diagnose: "最小诊断", teach: "针对性干预", review: "安排检查" };
const percent = (n: number, d: number) => d ? Math.round(n / d * 100) : null;
const ratio = (n: number, d: number) => d ? `${n}/${d}（${Math.round(n / d * 100)}%）` : "无样本";
export function TeachingEvaluationPanel() {
  const [scenarioId, setScenarioId] = useState(replayScenarios[0].id);
  const [step, setStep] = useState(0);
  const scenario = replayScenarios.find((s) => s.id === scenarioId)!;
  const checkpoint = scenario.checkpoints[step];
  const evidence = report.summaries[0], baseline = report.summaries[1];
  const metrics = [
    { label: "行动匹配", a: percent(evidence.actionMatchCount, evidence.checkpoints), b: percent(baseline.actionMatchCount, baseline.checkpoints) },
    { label: "画像匹配", a: percent(evidence.profileMatchCount, evidence.checkpoints), b: percent(baseline.profileMatchCount, baseline.checkpoints) },
    { label: "有依据行动", a: percent(evidence.supportedActionCount, evidence.actionCount), b: percent(baseline.supportedActionCount, baseline.actionCount) },
    { label: "有效引用", a: percent(evidence.validReferenceCount, evidence.referenceCount), b: percent(baseline.validReferenceCount, baseline.referenceCount) },
    { label: "误判改善 ↓", a: percent(evidence.falseImprovementCount, evidence.negativeCount), b: percent(baseline.falseImprovementCount, baseline.negativeCount) },
  ];
  const mismatches = report.rows.filter(row => row.policy === "evidence" && (!row.actionMatch || !row.profileMatch || row.falseImprovement));
  return <div className="space-y-6">
    <div><h1 className="font-bold text-[32px]">教学策略回放评测</h1><p className="mt-2 text-sm text-slate-600">对同一份学生记录，按发生时间比较证据驱动策略与直接讲解基线。全部为合成场景，不读取学生档案，不调用模型。</p></div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="证据驱动策略指标">{metrics.slice(0,3).map(m => <WorkspaceMetric key={m.label} label={m.label} value={m.a === null ? "无样本" : m.a + "%"} note={m.a !== null && m.b !== null ? "较直接讲解基线 " + (m.a - m.b >= 0 ? "+" : "") + (m.a - m.b) + " 个百分点" : "当前场景集暂无可比较样本"} icon={<BarChart3 className="size-4" />} />)}<WorkspaceMetric label="误判改善" value={evidence.falseImprovementCount} note={"在 " + evidence.negativeCount + " 个预期不应改善的检查点中统计"} /></section>
    <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <div className="surface-card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">策略表现对比</h2><div className="flex gap-4 text-xs text-slate-500"><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-terracotta-800" />证据驱动</span><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-slate-300" />直接讲解</span></div></div><div className="mt-6 space-y-5">{metrics.map(m => <div key={m.label} className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-4"><span className="text-sm text-slate-600">{m.label}</span><div className="space-y-2">{[{value:m.a,label:"证据驱动",color:"bg-terracotta-800"},{value:m.b,label:"直接讲解",color:"bg-slate-300"}].map(bar => <div key={bar.label} className="flex items-center gap-3" aria-label={m.label + "，" + bar.label + "：" + (bar.value === null ? "无样本" : bar.value + "%")}><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={"h-full rounded-full " + bar.color} style={{width:(bar.value ?? 0) + "%"}} /></div><span className="w-12 text-right text-xs tabular-nums text-slate-600">{bar.value === null ? "—" : bar.value + "%"}</span></div>)}</div></div>)}</div><p className="mt-6 text-xs text-slate-400">匹配与证据指标越高越好；误判改善越低越好。</p></div>
      <aside className="surface-card p-6"><p className="text-xs font-semibold text-terracotta-800">评测观察</p><h2 className="mt-3 text-xl font-semibold">{mismatches.length ? mismatches.length + " 个检查点值得复核" : "当前预期全部匹配"}</h2><p className="mt-3 text-sm leading-6 text-slate-500">对照同一时间点可见的学习证据，查看策略何时收集证据、何时介入。以下结论仅适用于这组固定合成场景。</p>{mismatches.length > 0 && <button className="mt-4 rounded-lg bg-terracotta-50 px-3 py-2 text-left text-sm text-terracotta-900" onClick={() => { setScenarioId(mismatches[0].scenarioId); setStep(replayScenarios.find(s => s.id === mismatches[0].scenarioId)!.checkpoints.findIndex(c => c.at === mismatches[0].at)); document.getElementById("evaluation-replay")?.scrollIntoView({behavior:"smooth"}); }}>查看首个待复核场景 →</button>}<div className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">{report.limitations}</div></aside>
    </section>
    <section className="surface-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">固定场景集：{replayScenarios.length} 个场景 · {report.summaries[0].checkpoints} 个检查点</h2><a href="/api/evaluation" download className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600"><ArrowDownToLine className="size-3.5" />下载评测 JSON</a></div>
      <p className="mt-3 text-sm text-slate-600">{report.limitations}</p>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">查看原始指标与统计口径</summary><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">策略</th><th className="p-3">行动匹配</th><th className="p-3">画像匹配</th><th className="p-3">误判改善</th><th className="p-3">有依据行动</th><th className="p-3">有效引用</th></tr></thead><tbody>{report.summaries.map((r) => <tr key={r.policy} className="border-b"><td className="p-3 font-medium">{policyNames[r.policy]}</td><td className="p-3">{ratio(r.actionMatchCount, r.checkpoints)}</td><td className="p-3">{ratio(r.profileMatchCount, r.checkpoints)}</td><td className="p-3">{ratio(r.falseImprovementCount, r.negativeCount)}</td><td className="p-3">{ratio(r.supportedActionCount, r.actionCount)}</td><td className="p-3">{ratio(r.validReferenceCount, r.referenceCount)}</td></tr>)}</tbody></table></div>
      <p className="mt-3 text-xs text-slate-500">误判改善的分母为预期不应改善的检查点。行动匹配比较行动类型集合，不评价措辞、排序或教学收益。基线为明确声明的简化规则：有错就讲解，后续同知识点独立正确即认为改善。教师耗时与模型费用未测量。</p></details>
    </section>
    <section id="evaluation-replay" className="surface-card space-y-4 p-6">
      <h2 className="font-semibold">逐步回放</h2>
      <div className="flex flex-wrap gap-4"><label className="flex flex-col gap-1 text-sm">选择场景<select aria-label="选择回放场景" className="rounded border p-2" value={scenarioId} onChange={(e) => { setScenarioId(e.target.value); setStep(0); }}>{replayScenarios.map((s) => <option value={s.id} key={s.id}>{s.title}</option>)}</select></label><label className="flex flex-col gap-1 text-sm">检查时间<select aria-label="选择检查时间" className="rounded border p-2" value={step} onChange={(e) => setStep(Number(e.target.value))}>{scenario.checkpoints.map((c, i) => <option value={i} key={c.at}>{new Date(c.at).toISOString().slice(0, 10)} · 第 {i + 1} 步</option>)}</select></label></div>
      <p className="rounded-lg bg-terracotta-50 p-3 text-sm">预期行动：{checkpoint.expectedActions.map((k) => kinds[k]).join("、") || "暂无待处理建议"}；预期画像：{checkpoint.expectedProfile || "无具体错因画像"}。{checkpoint.reason}</p>
      <div className="grid gap-4 md:grid-cols-2">{(["evidence", "direct"] as const).map((policy) => {
        const result = replayCheckpoint(scenario, checkpoint.at, policy);
        return <div key={policy} className="rounded-lg border p-4 space-y-3"><h3 className="font-semibold">{policyNames[policy]}</h3><p className="text-sm">画像状态：<strong>{result.profile || "无具体错因画像"}</strong></p>{result.actions.length ? result.actions.map((a) => <article key={a.id} className="rounded bg-slate-50 p-3 text-sm"><p className="font-medium">{kinds[a.kind]} · {a.title}</p><p className="mt-1">{a.summary}</p><p className="mt-2 text-xs text-slate-500">依据：{a.evidence.map((ref) => `${ref.label}（${ref.eventId}）`).join("、")}</p></article>) : <p className="text-sm text-slate-500">暂无待处理建议。</p>}</div>;
      })}</div>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">查看此时可见的原始记录</summary><ol className="mt-3 space-y-2 text-sm">{replayCheckpoint(scenario, checkpoint.at, "evidence").events.map((e) => <li key={e.id} className="border-b py-2"><span className="font-medium">{e.occurredAt.slice(0, 10)} · {e.id}</span><p>{e.responseText || e.notes || e.kind}{e.correctness ? ` · ${e.correctness} · ${e.supportLevel}` : ""}</p>{e.targetAttemptId && <p className="text-xs text-slate-500">验证目标：{e.targetAttemptId}</p>}</li>)}</ol></details>
    </section>
  </div>;
}

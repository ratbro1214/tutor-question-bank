"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, CalendarCheck, ChevronRight, ClipboardCheck, LoaderCircle, RefreshCw, SearchCheck, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildTeachingAgentPlan,
  type AgentQuestion,
  type TeachingAction,
} from "@/lib/teaching-agent";
import type { LearningEvent } from "@/lib/learning";
import type { DiagnosticPackage } from "@/lib/diagnostic-generation";

const actionMeta: Record<TeachingAction["kind"], { label: string; icon: typeof Bot }> = {
  collect_evidence: { label: "补充证据", icon: ClipboardCheck },
  diagnose: { label: "最小诊断", icon: SearchCheck },
  teach: { label: "针对性干预", icon: Bot },
  review: { label: "复查验证", icon: CalendarCheck },
};

const confidenceLabel = { high: "高", medium: "中", low: "低" } as const;

type SavedDiagnostic = {
  planId: string;
  value: DiagnosticPackage;
  mode: "live" | "fallback";
  status: "draft" | "adopted" | "dismissed";
  createdAt: string;
};

export function TeachingAgentPanel({
  questions,
  events,
  onOpen,
  studentId,
}: {
  studentId: string;
  questions: AgentQuestion[];
  events: LearningEvent[];
  onOpen: (id: number) => void;
}) {
  const router = useRouter();
  const plan = buildTeachingAgentPlan(questions, events);
  const [generatingId, setGeneratingId] = useState("");
  const [generationError, setGenerationError] = useState<Record<string, string>>({});
  const [packages, setPackages] = useState<Record<string, SavedDiagnostic>>({});
  const [decidingId, setDecidingId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/students/${studentId}/agent/diagnostics`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { error?: string; plans?: Array<{ id: string; actionId: string; package: DiagnosticPackage; mode: "live" | "fallback"; status: SavedDiagnostic["status"]; createdAt: string }> };
        if (!response.ok) throw new Error(data.error || "诊断方案加载失败。");
        const restored: Record<string, SavedDiagnostic> = {};
        for (const item of data.plans || []) if (!restored[item.actionId]) restored[item.actionId] = { planId: item.id, value: item.package, mode: item.mode, status: item.status, createdAt: item.createdAt };
        setPackages(restored);
      })
      .catch((error) => { if (!controller.signal.aborted) setGenerationError({ load: error instanceof Error ? error.message : "诊断方案加载失败。" }); });
    return () => controller.abort();
  }, [studentId]);

  async function generate(action: TeachingAction) {
    setGeneratingId(action.id);
    setGenerationError((current) => ({ ...current, [action.id]: "" }));
    try {
      const response = await fetch(`/api/students/${studentId}/agent/diagnostics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id, questionId: action.questionId }),
      });
      const data = await response.json() as { error?: string; package?: DiagnosticPackage; mode?: "live" | "fallback"; plan?: { id: string; status: "draft"; createdAt: string } };
      if (!response.ok || !data.package || !data.mode || !data.plan) throw new Error(data.error || "诊断包生成失败。");
      setPackages((current) => ({ ...current, [action.id]: { planId: data.plan!.id, value: data.package!, mode: data.mode!, status: data.plan!.status, createdAt: data.plan!.createdAt } }));
    } catch (error) {
      setGenerationError((current) => ({ ...current, [action.id]: error instanceof Error ? error.message : "诊断包生成失败。" }));
    } finally {
      setGeneratingId("");
    }
  }

  async function decide(action: TeachingAction, nextStatus: "adopted" | "dismissed") {
    const saved = packages[action.id];
    if (!saved) return;
    setDecidingId(saved.planId);
    setGenerationError((current) => ({ ...current, [action.id]: "" }));
    try {
      const response = await fetch(`/api/students/${studentId}/agent/diagnostics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: saved.planId, status: nextStatus }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "诊断方案状态保存失败。");
      setPackages((current) => ({ ...current, [action.id]: { ...saved, status: nextStatus } }));
      if (nextStatus === "adopted") router.push(`/students/${studentId}/questions/${action.questionId}?diagnosticPlanId=${encodeURIComponent(saved.planId)}`);
    } catch (error) {
      setGenerationError((current) => ({ ...current, [action.id]: error instanceof Error ? error.message : "诊断方案状态保存失败。" }));
    } finally {
      setDecidingId("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-semibold text-emerald-950">
              <ShieldCheck className="size-5" />教学智能体工作台
            </div>
            <p className="mt-1 text-sm leading-6 text-emerald-900/80">
              已读取 {plan.evidenceEventCount} 条学习事件，给出 {plan.actions.length} 项下一步建议。
            </p>
          </div>
          <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-800">
            教师确认后执行
          </Badge>
        </div>
        <p className="mt-3 text-xs leading-5 text-emerald-900/70">{plan.notice}</p>
      </div>

      {!plan.actions.length && (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <ClipboardCheck className="mx-auto size-8 text-slate-300" />
          <h3 className="mt-3 font-semibold text-slate-900">当前没有待处理建议</h3>
          <p className="mt-1 text-sm text-slate-500">继续记录新的提问、真实作答或复查结果，智能体会据此更新计划。</p>
        </div>
      )}
      {generationError.load && <p role="alert" className="text-sm text-red-700">{generationError.load}</p>}

      {plan.actions.map((action) => {
        const meta = actionMeta[action.kind];
        const Icon = meta.icon;
        const generated = packages[action.id];
        return (
          <article key={action.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={action.priority === "high" ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700"}>
                    {action.priority === "high" ? "优先处理" : "建议处理"}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"><Icon className="size-3.5" />{meta.label}</span>
                  <span className="text-xs text-slate-400">建议置信度：{confidenceLabel[action.confidence]}</span>
                </div>
                <h3 className="mt-2 font-semibold text-slate-950">{action.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{action.summary}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onOpen(action.questionId)}>
                查看题目 #{action.questionId}<ChevronRight />
              </Button>
            </div>

            <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">为什么建议</p>
                <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                  {action.rationale.map((item) => <li key={item}>· {item}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">建议步骤</p>
                <ol className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                  {action.suggestedSteps.map((item, index) => <li key={item}>{index + 1}. {item}</li>)}
                </ol>
              </div>
            </div>
            {action.confidence === "low" && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />证据较弱：此建议用于补充信息，不是对学生能力或具体错因的结论。
              </p>
            )}
            {action.kind === "diagnose" && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <Button onClick={() => void generate(action)} disabled={generatingId === action.id}>
                  {generatingId === action.id ? <><LoaderCircle className="animate-spin" />正在生成诊断包…</> : generated ? <><RefreshCw />重新生成</> : <><SearchCheck />生成两道诊断题</>}
                </Button>
                {generationError[action.id] && <p role="alert" className="mt-2 text-sm text-red-700">{generationError[action.id]}</p>}
                {generated && (
                  <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold text-indigo-950">诊断包 · {generated.value.diagnostic_goal}</h4>
                      <Badge variant="outline" className="bg-white">{generated.mode === "live" ? "AI 生成，待教师核对" : "规则回退"}</Badge>
                    </div>
                    <div className="mt-4 space-y-4">
                      {generated.value.questions.map((item, index) => (
                        <section key={`${index}-${item.question}`} className="rounded-lg border border-indigo-100 bg-white p-4">
                          <p className="font-medium text-slate-950">{index + 1}. {item.question}</p>
                          <dl className="mt-3 grid gap-2 text-sm leading-6 text-slate-600 md:grid-cols-2">
                            <div><dt className="font-medium text-slate-900">诊断目的</dt><dd>{item.purpose}</dd></div>
                            <div><dt className="font-medium text-slate-900">预期答案</dt><dd>{item.expected_answer}</dd></div>
                            <div><dt className="font-medium text-slate-900">需观察的错误信号</dt><dd>{item.error_signal}</dd></div>
                            <div><dt className="font-medium text-slate-900">后续分支</dt><dd>答对：{item.follow_up_if_correct}<br />答错：{item.follow_up_if_wrong}</dd></div>
                          </dl>
                        </section>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-indigo-900/75">教师提示：{generated.value.teacher_note}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-indigo-100 pt-4">
                      {generated.status === "draft" ? (
                        <>
                          <Button onClick={() => void decide(action, "adopted")} disabled={decidingId === generated.planId}>采用并记录诊断结果</Button>
                          <Button variant="outline" onClick={() => void decide(action, "dismissed")} disabled={decidingId === generated.planId}>暂不采用</Button>
                        </>
                      ) : (
                        <Badge variant="outline" className="bg-white">{generated.status === "adopted" ? "教师已采用" : "教师已放弃"}</Badge>
                      )}
                      <span className="text-xs text-slate-500">方案仅是草案，学生作答需另行记录。</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

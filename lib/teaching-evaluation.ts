import { buildLearnerProfile, type LearningEvent } from "./learning";
import { buildTeachingAgentPlan, type TeachingAction, type TeachingActionKind } from "./teaching-agent";
import type { ReplayScenario } from "./evaluation-scenarios";

export type EvaluationPolicy = "evidence" | "direct";
export const policyNames: Record<EvaluationPolicy, string> = { evidence: "证据驱动策略", direct: "直接讲解基线" };
const improved = new Set(["初步改善", "阶段性稳定"]);
function directBaseline(events: LearningEvent[]) {
  // Intentionally simple, declared comparator: teach after any wrong answer;
  // any later same-point independent success is treated as improvement.
  const wrong = events.filter((e) => e.kind === "attempt" && e.correctness !== "正确");
  const latest = wrong.at(-1);
  const success = latest && events.some((e) => e.kind === "attempt" && e.correctness === "正确" && e.supportLevel === "独立完成" && e.knowledgePointCode === latest.knowledgePointCode && e.occurredAt > latest.occurredAt);
  const source = latest || events.filter((e) => e.kind === "inquiry").at(-1);
  const kind: TeachingActionKind = latest ? success ? "review" : "teach" : "collect_evidence";
  const action: TeachingAction | null = source ? { id: `baseline:${source.id}`, kind, questionId: source.questionId, priority: "medium", confidence: "low", title: policyNames.direct, summary: "有错误就讲解，后续同知识点独立正确即标记改善。", rationale: ["固定规则比较策略"], evidence: [{ eventId: source.id, questionId: source.questionId, occurredAt: source.occurredAt, label: "规则输入" }], suggestedSteps: [], requiresTeacherApproval: true } : null;
  return { actions: action ? [action] : [], profile: latest ? success ? "初步改善" : "已确认" : null };
}
export function replayCheckpoint(scenario: ReplayScenario, at: string, policy: EvaluationPolicy) {
  const timestamp = new Date(at).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("回放时间无效。");
  const events = scenario.events.filter((e) => new Date(e.occurredAt).getTime() <= timestamp)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const plan = policy === "evidence" ? { actions: buildTeachingAgentPlan(scenario.questions, events, new Date(at)).actions, profile: buildLearnerProfile(events)[0]?.status || null }
    : directBaseline(events);
  const available = new Map(events.map((e) => [e.id, e]));
  const references = plan.actions.flatMap((action) => action.evidence);
  const validReferences = references.filter((ref) => { const e = available.get(ref.eventId); return e && e.questionId === ref.questionId && e.occurredAt === ref.occurredAt; });
  return { ...plan, events, referenceCount: references.length, validReferenceCount: validReferences.length, supportedActionCount: plan.actions.filter((a) => a.evidence.length > 0 && a.evidence.every((ref) => validReferences.includes(ref))).length };
}
const sameActions = (a: TeachingActionKind[], b: TeachingActionKind[]) => [...new Set(a)].sort().join() === [...new Set(b)].sort().join();
export function evaluatePolicies(scenarios: ReplayScenario[]) {
  const rows = scenarios.flatMap((scenario) => scenario.checkpoints.flatMap((checkpoint) => (["evidence", "direct"] as const).map((policy) => {
    const actual = replayCheckpoint(scenario, checkpoint.at, policy);
    const kinds = [...new Set(actual.actions.map((a) => a.kind))];
    return { scenarioId: scenario.id, title: scenario.title, at: checkpoint.at, policy, expectedActions: checkpoint.expectedActions, actualActions: kinds,
      expectedProfile: checkpoint.expectedProfile, actualProfile: actual.profile,
      actionMatch: sameActions(kinds, checkpoint.expectedActions), profileMatch: actual.profile === checkpoint.expectedProfile,
      falseImprovement: improved.has(actual.profile || "") && !improved.has(checkpoint.expectedProfile || ""),
      actionCount: actual.actions.length, supportedActionCount: actual.supportedActionCount, referenceCount: actual.referenceCount, validReferenceCount: actual.validReferenceCount,
      reason: checkpoint.reason };
  })));
  const summaries = (["evidence", "direct"] as const).map((policy) => {
    const selected = rows.filter((r) => r.policy === policy);
    const negativeCount = selected.filter((r) => !improved.has(r.expectedProfile || "")).length;
    const actionCount = selected.reduce((n, r) => n + r.actionCount, 0);
    const references = selected.reduce((n, r) => n + r.referenceCount, 0);
    return { policy, checkpoints: selected.length, actionMatchCount: selected.filter((r) => r.actionMatch).length, profileMatchCount: selected.filter((r) => r.profileMatch).length,
      falseImprovementCount: selected.filter((r) => r.falseImprovement).length, negativeCount,
      actionCount, supportedActionCount: selected.reduce((n, r) => n + r.supportedActionCount, 0), referenceCount: references, validReferenceCount: selected.reduce((n, r) => n + r.validReferenceCount, 0) };
  });
  return { schemaVersion: 1, dataset: "authored-synthetic-v1", limitations: "合成场景与研发者编写的验收预期；不是专家标注、真实学习效果或模型能力实验。证据完整只衡量引用真实存在，不等于教学合理性。", modelCalls: 0, teacherTimeMs: null, modelCost: null, summaries, rows };
}

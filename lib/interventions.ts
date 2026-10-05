import { z } from "zod";
import { evidenceReference, type LearningEvent } from "./learning";
const date = z.string().datetime({ offset: true }).transform((v) => new Date(v).toISOString());
export const interventionInput = z.object({ id: z.string().uuid(), sourceAttemptId: z.string().uuid(), goal: z.string().trim().min(1).max(1000), strategy: z.string().trim().min(1).max(2000), checkInstruction: z.string().trim().min(1).max(1000), dueAt: date });
export const interventionDecision = z.discriminatedUnion("action", [
  z.object({ id: z.string().uuid(), action: z.literal("cancel") }),
  z.object({ id: z.string().uuid(), action: z.literal("implement"), occurredAt: date, notes: z.string().trim().min(1).max(4000) }),
]);
export type InterventionPlan = { id: string; questionId: number; sourceAttemptId: string; knowledgePointCode: string; goal: string; strategy: string; checkInstruction: string; dueAt: string; createdAt: string; status: string; teachingRecordId: string | null; implementedAt: string | null };
export function interventionProgress(plan: InterventionPlan, events: LearningEvent[], now = new Date()) {
  const visible = events.filter((e) => e.occurredAt <= now.toISOString());
  const checks = visible.filter((e) => e.kind === "attempt" && e.interventionPlanId === plan.id && e.targetAttemptId === plan.sourceAttemptId && e.knowledgePointCode === plan.knowledgePointCode && !!plan.implementedAt && e.occurredAt > plan.implementedAt).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const post = checks.filter((e) => e.attemptStage === "干预后检测").at(-1);
  const interval = checks.filter((e) => e.attemptStage === "间隔复查" && e.occurredAt >= plan.dueAt && !!post && e.occurredAt > post.occurredAt).at(-1);
  const passed = (e?: LearningEvent) => e?.correctness === "正确" && e.supportLevel === "独立完成";
  const status = plan.status === "cancelled" ? "已取消" : !plan.implementedAt || plan.implementedAt > now.toISOString() ? "待实施"
    : !post ? "待独立检测" : !passed(post) ? "检测仍需干预" : !interval ? "初步改善，待间隔复查" : !passed(interval) ? "复查仍需干预" : "本轮阶段性改善";
  const source = visible.find((e) => e.id === plan.sourceAttemptId);
  const teaching = visible.find((e) => e.id === plan.teachingRecordId);
  return { status, post, interval, overdue: plan.status === "implemented" && !interval && now.toISOString() > plan.dueAt,
    evidence: [source, teaching, post, interval].filter((e): e is LearningEvent => !!e).map((e) => evidenceReference(e, e.kind === "teaching" ? "实际干预记录" : e.id === plan.sourceAttemptId ? "原始错因证据" : "本轮真实检测")) };
}

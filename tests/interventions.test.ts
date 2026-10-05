import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { interventionInput, interventionDecision, interventionProgress, type InterventionPlan } from "../lib/interventions";
import { buildLearnerProfile, learningInput, type LearningEvent } from "../lib/learning";
const plan: InterventionPlan = { id: crypto.randomUUID(), questionId: 1, sourceAttemptId: crypto.randomUUID(), knowledgePointCode: "ALG-FORMULA", goal: "独立推导", strategy: "分配律", checkInstruction: "新题独立检测", dueAt: "2026-09-08T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z", status: "implemented", teachingRecordId: "teaching", implementedAt: "2026-09-02T00:00:00.000Z" };
const source: LearningEvent = { id: plan.sourceAttemptId, questionId: 1, kind: "attempt", occurredAt: "2026-09-01T00:00:00.000Z", notes: "", knowledgePointCode: plan.knowledgePointCode, correctness: "错误", teacherDecision: "教师确认", errorCode: "FORMULA_OMIT_MIDDLE", errorLabel: "遗漏中间项" };
const post: LearningEvent = { ...source, id: crypto.randomUUID(), interventionPlanId: plan.id, targetAttemptId: source.id, occurredAt: "2026-09-03T00:00:00.000Z", attemptStage: "干预后检测", correctness: "正确", supportLevel: "独立完成", teacherDecision: "未判断", errorCode: undefined, checkQuestion: "展开(2x+3)²" };
const interval = { ...post, id: crypto.randomUUID(), attemptStage: "间隔复查" as const, occurredAt: plan.dueAt };
const now = new Date("2026-09-10T00:00:00.000Z");
test("干预计划和实际讲解不冒充学生改善，需两阶段独立证据", () => {
  assert.equal(interventionProgress({ ...plan, status: "planned", implementedAt: null }, [], now).status, "待实施");
  assert.equal(interventionProgress(plan, [source], now).status, "待独立检测");
  assert.equal(interventionProgress(plan, [source, post], now).status, "初步改善，待间隔复查");
  assert.equal(interventionProgress(plan, [source, post, interval], now).status, "本轮阶段性改善");
  assert.deepEqual(interventionProgress(plan, [source, post, interval], now).evidence.map((e) => e.eventId), [source.id, post.id, interval.id]);
});
test("其他计划、提前复查、未来记录与提示后正确不提供本轮通过证据", () => {
  assert.equal(interventionProgress(plan, [post, { ...interval, interventionPlanId: "other" }], now).interval, undefined);
  assert.equal(interventionProgress(plan, [post, { ...interval, occurredAt: "2026-09-04T00:00:00.000Z" }], now).interval, undefined);
  assert.equal(interventionProgress(plan, [post, interval], new Date("2026-09-02T01:00:00Z")).status, "待独立检测");
  assert.equal(interventionProgress(plan, [{ ...post, supportLevel: "提示后完成" }], now).status, "检测仍需干预");
  assert.equal(interventionProgress(plan, [post], now).overdue, true);
});
test("后续复查失败撤回本轮改善，画像只使用该阶段最新作答", () => {
  const failed = { ...interval, id: crypto.randomUUID(), occurredAt: "2026-09-09T00:00:00.000Z", correctness: "错误" as const };
  assert.equal(interventionProgress(plan, [source, post, interval, failed], now).status, "复查仍需干预");
  assert.equal(buildLearnerProfile([source, post, interval, failed])[0].status, "初步改善");
});
test("干预输入和检查拒绝缺失题干或不合阶段的绑定", () => {
  assert.equal(interventionInput.safeParse({ ...plan, strategy: " " }).success, false);
  assert.equal(interventionDecision.safeParse({ id: plan.id, action: "implement", occurredAt: plan.implementedAt, notes: "" }).success, false);
  const payload = { ...post, inquiryId: "ask", responseText: "4x²+12x+9", evidenceLevel: "仅有最终答案", evidenceSource: "作业" };
  assert.equal(learningInput.safeParse(payload).success, true);
  assert.equal(learningInput.safeParse({ ...payload, checkQuestion: "" }).success, false);
  assert.equal(learningInput.safeParse({ ...payload, attemptStage: "首次作答" }).success, false);
});
test("全部迁移保留旧作答，无关联检查题为空，外键拒绝不存在的计划", () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  const columns = db.prepare("PRAGMA table_info(student_attempts)").all();
  assert.ok(columns.some((r) => r.name === "intervention_plan_id"));
  assert.ok(columns.some((r) => r.name === "check_question" && r.dflt_value === "''"));
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  db.close();
});

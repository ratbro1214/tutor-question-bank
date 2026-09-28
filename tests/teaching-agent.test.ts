import test from "node:test";
import assert from "node:assert/strict";
import { buildTeachingAgentPlan, type AgentQuestion } from "../lib/teaching-agent";
import type { LearningEvent } from "../lib/learning";

const questions: AgentQuestion[] = [{
  id: 1,
  chapterName: "整式的乘法与因式分解",
  knowledgePoints: [{ code: "ALG-FORMULA", name: "乘法公式" }],
}];
const now = new Date("2026-09-28T00:00:00.000Z");

test("只有提问时保持克制并建议先补真实作答证据", () => {
  const events: LearningEvent[] = [{
    id: "inquiry-1",
    questionId: 1,
    kind: "inquiry",
    occurredAt: "2026-09-27T08:00:00.000Z",
    notes: "",
  }];
  const plan = buildTeachingAgentPlan(questions, events, now);
  assert.equal(plan.actions[0].kind, "collect_evidence");
  assert.equal(plan.actions[0].confidence, "low");
  assert.match(plan.actions[0].summary, /信息不足/);
  assert.doesNotMatch(JSON.stringify(plan), /掌握率.*\d/);
});

test("最终答案错误但证据不足时优先给出两道最小诊断", () => {
  const events: LearningEvent[] = [{
    id: "attempt-1",
    questionId: 1,
    kind: "attempt",
    occurredAt: "2026-09-27T08:00:00.000Z",
    notes: "",
    attemptStage: "首次作答",
    correctness: "错误",
    supportLevel: "独立完成",
    evidenceLevel: "仅有最终答案",
    evidenceSource: "考试答题卡",
    knowledgePointCode: "ALG-FORMULA",
    diagnosisStatus: "错因未知",
  }];
  const plan = buildTeachingAgentPlan(questions, events, now);
  const action = plan.actions.find((item) => item.kind === "diagnose")!;
  assert.equal(action.priority, "high");
  assert.equal(action.confidence, "low");
  assert.equal(action.suggestedSteps.length, 2);
  assert.match(action.summary, /不能确定具体错因/);
});

test("逾期复查排在普通建议之前且保留教师安排依据", () => {
  const events: LearningEvent[] = [
    { id: "inquiry-1", questionId: 1, kind: "inquiry", occurredAt: "2026-09-10T08:00:00.000Z", notes: "" },
    { id: "review-1", questionId: 1, inquiryId: "inquiry-1", kind: "review", occurredAt: "2026-09-10T08:10:00.000Z", dueAt: "2026-09-20T00:00:00.000Z", notes: "" },
  ];
  const plan = buildTeachingAgentPlan(questions, events, now);
  assert.equal(plan.actions[0].kind, "review");
  assert.match(plan.actions[0].title, /逾期 8 天/);
  assert.equal(plan.actions[0].confidence, "high");
  assert.equal(plan.actions[0].requiresTeacherApproval, true);
});

test("教师确认的重复错因生成针对性干预而非自动结论", () => {
  const base: LearningEvent = {
    id: "attempt-1",
    questionId: 1,
    kind: "attempt",
    occurredAt: "2026-09-20T08:00:00.000Z",
    notes: "",
    attemptStage: "首次作答",
    correctness: "错误",
    supportLevel: "独立完成",
    evidenceLevel: "有完整过程或教师观察",
    evidenceSource: "作业",
    knowledgePointCode: "ALG-FORMULA",
    teacherDecision: "教师确认",
    errorCode: "FORMULA_OMIT_MIDDLE",
    errorLabel: "遗漏中间项",
  };
  const plan = buildTeachingAgentPlan(questions, [
    base,
    { ...base, id: "attempt-2", occurredAt: "2026-09-22T08:00:00.000Z" },
  ], now);
  const action = plan.actions.find((item) => item.kind === "teach")!;
  assert.equal(action.confidence, "high");
  assert.match(action.title, /遗漏中间项/);
  assert.match(action.rationale.join(""), /2 条教师确认或修正/);
  assert.equal(action.requiresTeacherApproval, true);
});

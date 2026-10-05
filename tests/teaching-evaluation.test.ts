import test from "node:test";
import assert from "node:assert/strict";
import { replayScenarios } from "../lib/evaluation-scenarios";
import { evaluatePolicies, replayCheckpoint } from "../lib/teaching-evaluation";

test("逐检查点回放行动与画像符合事先声明的合成场景预期", () => {
  const report = evaluatePolicies(replayScenarios);
  for (const row of report.rows.filter((r) => r.policy === "evidence")) {
    assert.equal(row.actionMatch, true, `${row.scenarioId} ${row.at}: ${row.actualActions}`);
    assert.equal(row.profileMatch, true, `${row.scenarioId} ${row.at}: ${row.actualProfile}`);
  }
});
test("早期回放不能看到未来错误、教学或检查，输入不变且结果可重现", () => {
  const scenario = replayScenarios.find((s) => s.id === "linked-intervention")!;
  const before = JSON.stringify(scenario);
  const early = replayCheckpoint(scenario, "2026-09-02T08:00:00.000Z", "evidence");
  assert.equal(early.profile, "待验证");
  assert.equal(early.events.length, 2);
  assert.ok(early.actions.every((a) => a.evidence.every((ref) => early.events.some((e) => e.id === ref.eventId))));
  assert.deepEqual(evaluatePolicies(replayScenarios), evaluatePolicies(replayScenarios));
  assert.equal(JSON.stringify(scenario), before);
  assert.throws(() => replayCheckpoint(scenario, "invalid", "evidence"));
});
test("基线误判率按不应改善检查点计算，引用完整率不能冒充教学正确率", () => {
  const { summaries, rows } = evaluatePolicies(replayScenarios);
  assert.equal(summaries[0].falseImprovementCount, 0);
  assert.ok(summaries[1].falseImprovementCount > 0);
  assert.equal(summaries[1].validReferenceCount, summaries[1].referenceCount);
  assert.ok(summaries[1].actionMatchCount < summaries[1].checkpoints);
  assert.equal(summaries[1].falseImprovementCount, rows.filter((r) => r.policy === "direct" && r.falseImprovement).length);
});
test("没有样本时返回零分母计数而不是虚构百分比", () => {
  const report = evaluatePolicies([]);
  assert.equal(report.rows.length, 0);
  assert.equal(report.summaries[0].checkpoints, 0);
  assert.equal(report.teacherTimeMs, null);
  assert.equal(report.modelCost, null);
});

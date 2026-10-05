import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { buildDiagnosticQueue, buildLearnerProfile, learningInput, type LearningEvent } from "../lib/learning";
import { buildTeachingAgentPlan } from "../lib/teaching-agent";

const source: LearningEvent = {
  id: crypto.randomUUID(), questionId: 1, inquiryId: "inquiry-1", kind: "attempt",
  occurredAt: "2026-09-01T08:00:00.000Z", notes: "", attemptStage: "首次作答",
  knowledgePointCode: "ALG-FORMULA", responseText: "x²+9", correctness: "错误", supportLevel: "独立完成",
  evidenceLevel: "仅有最终答案", evidenceSource: "作业", teacherDecision: "未判断", diagnosisStatus: "错因未知",
};
function probe(id: string, overrides: Partial<LearningEvent> = {}): LearningEvent {
  return { ...source, id, occurredAt: "2026-09-02T08:00:00.000Z", attemptStage: "诊断检测",
    correctness: "正确", responseText: "x²+6x+9", diagnosticItemId: id, targetAttemptId: source.id, ...overrides };
}

test("同知识点的其他作答不会替原始错因完成补证", () => {
  const events = [source, probe("a", { targetAttemptId: undefined }), probe("b", { targetAttemptId: undefined })];
  assert.equal(buildDiagnosticQueue(events).find((item) => item.attemptId === source.id)!.status, "错因未知");
});
test("两道明确关联且独立正确的诊断题才提供两条补证", () => {
  const events = [source, probe("a"), probe("b")];
  const entry = buildDiagnosticQueue(events).find((item) => item.attemptId === source.id)!;
  assert.equal(entry.status, "未发现持续性证据");
  assert.deepEqual(entry.evidence.map((item) => item.eventId), [source.id, "a", "b"]);
  assert.equal(buildDiagnosticQueue([source, probe("a"), probe("b", { supportLevel: "提示后完成" })])[0].status, "错因未知");
});
test("重复同一道诊断题或其后答错，不会被计作两道独立正确题", () => {
  const repeated = probe("retry", { diagnosticItemId: "a", occurredAt: "2026-09-03T08:00:00.000Z" });
  assert.equal(buildDiagnosticQueue([source, probe("a"), repeated])[0].status, "错因未知");
  assert.equal(buildDiagnosticQueue([source, probe("a"), probe("b"), { ...repeated, correctness: "错误" }])
    .find((entry) => entry.attemptId === source.id)!.status, "错因未知");
});
test("画像只用明确针对原错因的检查更新状态，并引用真实记录", () => {
  const confirmed = { ...source, teacherDecision: "教师确认" as const, errorCode: "FORMULA_OMIT_MIDDLE", errorLabel: "遗漏中间项" };
  const unrelated = probe("unrelated", { targetAttemptId: undefined, attemptStage: "间隔复查" });
  const [pending] = buildLearnerProfile([confirmed, unrelated]);
  assert.equal(pending.status, "待验证");
  assert.ok(pending.uncertainties.some((item) => item.includes("独立正确")));
  const linked = probe("linked", { attemptStage: "间隔复查" });
  const [stable] = buildLearnerProfile([confirmed, linked]);
  assert.equal(stable.status, "阶段性稳定");
  assert.deepEqual(stable.evidence.map((item) => item.eventId), [source.id, "linked"]);
  const action = buildTeachingAgentPlan([{ id: 1, chapterName: "乘法公式", knowledgePoints: [] }], [confirmed]).actions[0];
  assert.equal(action.evidence[0].eventId, source.id);
});
test("无关提问的讲解不改变原错因状态，提示后正确不视为独立改善", () => {
  const confirmed = { ...source, teacherDecision: "教师确认" as const, errorCode: "FORMULA_OMIT_MIDDLE", errorLabel: "遗漏中间项" };
  const teaching: LearningEvent = { id: "teaching", questionId: 1, inquiryId: "another-inquiry", kind: "teaching", occurredAt: "2026-09-02T00:00:00.000Z", notes: "" };
  assert.equal(buildLearnerProfile([confirmed, teaching, probe("hinted", { supportLevel: "提示后完成" })])[0].status, "待验证");
});
test("共享输入拒绝自引用和非诊断阶段的诊断题绑定", () => {
  const base = { ...source, candidateErrorCodes: [], targetAttemptId: source.id };
  assert.equal(learningInput.safeParse(base).success, false);
  assert.equal(learningInput.safeParse({ ...base, id: crypto.randomUUID(), attemptStage: "间隔复查", diagnosticItemId: "plan:1" }).success, false);
  assert.equal(learningInput.safeParse({ ...base, id: crypto.randomUUID(), attemptStage: "诊断检测", diagnosticItemId: "plan:1" }).success, true);
});
test("同一道诊断题最新答错时，画像不沿用之前正确的改善结论", () => {
  const confirmed = { ...source, teacherDecision: "教师确认" as const, errorCode: "FORMULA_OMIT_MIDDLE", errorLabel: "遗漏中间项" };
  const retry = probe("retry", { diagnosticItemId: "a", correctness: "错误", occurredAt: "2026-09-03T08:00:00.000Z" });
  assert.equal(buildLearnerProfile([confirmed, probe("a"), retry])[0].status, "待验证");
});
test("错因复发后新的关联独立检查可以更新画像，并保留复发前依据", () => {
  const confirmed = { ...source, teacherDecision: "教师确认" as const, errorCode: "FORMULA_OMIT_MIDDLE", errorLabel: "遗漏中间项" };
  const recurrence = { ...confirmed, id: "recurrence", occurredAt: "2026-09-03T08:00:00.000Z" };
  const initialCheck = probe("initial-check");
  assert.equal(buildLearnerProfile([confirmed, initialCheck, recurrence])[0].status, "再次出现");
  const newCheck = probe("new-check", { targetAttemptId: recurrence.id, occurredAt: "2026-09-04T08:00:00.000Z" });
  const updated = buildLearnerProfile([confirmed, initialCheck, recurrence, newCheck])[0];
  assert.equal(updated.status, "初步改善");
  assert.ok(updated.evidence.some((ref) => ref.eventId === initialCheck.id));
});
test("迁移保留旧方案并物化诊断题；旧作答不凭空获得关联", () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON");
  const files = readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort();
  for (const file of files.filter((name) => !name.startsWith("0010"))) db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  db.exec(`INSERT INTO students(id,name) VALUES(1,'fixture');
    INSERT INTO questions(id,student_id,image_key,original_filename,image_mime_type,extracted_question,chapter_code,chapter_name,question_type,difficulty,ai_classification,teacher_confirmed_classification)
    VALUES(1,1,'x','x','image/png','x','x','x','x','x','{}','{}');
    INSERT INTO student_attempts(id,question_id,occurred_at,stage,response_text,correctness,support_level) VALUES('source',1,'2026-09-01','首次作答','x','错误','独立完成');`);
  const content = JSON.stringify({ questions: [{ question: "first" }, { question: "second" }] });
  db.prepare("INSERT INTO diagnostic_plans(id,question_id,source_attempt_id,action_id,content,generation_mode,status,created_at) VALUES('old',1,'source','diagnose:source',?,'live','adopted','2026-09-02')").run(content);
  db.exec(readFileSync(`drizzle/${files.find((name) => name.startsWith("0010"))}`, "utf8"));
  assert.equal(db.prepare("SELECT content FROM diagnostic_plans").get()!.content, content);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM diagnostic_items").get()!.n, 2);
  assert.equal(db.prepare("SELECT target_attempt_id FROM student_attempts").get()!.target_attempt_id, null);
  assert.throws(() => db.exec("UPDATE student_attempts SET diagnostic_item_id='missing'"));
  db.exec("UPDATE student_attempts SET diagnostic_item_id='old:1'");
  db.exec("DELETE FROM diagnostic_items WHERE id='old:1'");
  assert.equal(db.prepare("SELECT diagnostic_item_id FROM student_attempts").get()!.diagnostic_item_id, null);
  assert.equal(db.prepare("SELECT response_text FROM student_attempts").get()!.response_text, "x");
  db.close();
});

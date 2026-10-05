import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { buildClassificationFromCandidate } from "../lib/classification";
import { buildDiagnosticQueue, type LearningEvent } from "../lib/learning";
const base = process.env.LEARNING_TEST_URL;
type FixtureResponse = { student: { id: number }; question: { id: number }; events: LearningEvent[]; mode: string; plan: { id: string }; plans: { id: string; items: { id: string; question: string }[] }[] };
if (base !== "http://127.0.0.1:8789") throw new Error("Use the isolated learning fixture at 127.0.0.1:8789.");
async function call(path: string, method = "GET", body?: unknown, expected = 200) {
  const r = await fetch(base + path, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await r.json() as FixtureResponse; assert.equal(r.status, expected, JSON.stringify(data)); return data;
}
const student = (await call("/api/students", "POST", { name: "DIAGNOSTIC_FIXTURE", grade: "初中" }, 201)).student.id;
const otherStudent = (await call("/api/students", "POST", { name: "OTHER_DIAGNOSTIC_FIXTURE", grade: "初中" }, 201)).student.id;
const classification = buildClassificationFromCandidate("初中", {
  extracted_question: "展开 (x+3)²", presentation_form: "解答题", has_diagram: false,
  extraction_confidence: 1, needs_review: false, review_reasons: [], extraction_notes: "",
}, {
  chapter_code: "ALG-EXPRESSION", core_knowledge_point_codes: ["ALG-FORMULA"], auxiliary_knowledge_point_codes: [], method_codes: [],
  question_type: "化简与求值", difficulty: "基础", confidence: 1, needs_followup: false, needs_review: false, review_reasons: [], classification_notes: "乘法公式",
});
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRusAAAAASUVORK5CYII=", "base64");
async function upload(id: number) {
  const f = new FormData(); f.set("image", new File([png], "fixture.png", { type: "image/png" }));
  f.set("studentId", String(id)); f.set("submissionId", crypto.randomUUID());
  f.set("teacherConfirmedClassification", JSON.stringify(classification));
  const r = await fetch(base + "/api/questions", { method: "POST", body: f }); const data = await r.json() as FixtureResponse;
  assert.equal(r.status, 201, JSON.stringify(data)); return data.question.id as number;
}
const question = await upload(student), foreignQuestion = await upload(otherStudent);
const endpoint = `/api/students/${student}/learning`, diagnosticEndpoint = `/api/students/${student}/agent/diagnostics`;
const initialInquiry = (await call(endpoint)).events.find((e: LearningEvent) => e.kind === "inquiry");
assert.ok(initialInquiry);
const inquiry = initialInquiry.id;
const foreignInquiry = (await call(`/api/students/${otherStudent}/learning`)).events[0].id;
const source = { id: crypto.randomUUID(), kind: "attempt", questionId: question, inquiryId: inquiry,
  occurredAt: "2026-09-01T08:00:00.000Z", attemptStage: "首次作答", knowledgePointCode: "ALG-FORMULA",
  responseText: "x²+9", correctness: "错误", supportLevel: "独立完成", evidenceLevel: "仅有最终答案", evidenceSource: "作业" };
await call(endpoint, "POST", source);
const foreignSource = { ...source, id: crypto.randomUUID(), questionId: foreignQuestion, inquiryId: foreignInquiry };
await call(`/api/students/${otherStudent}/learning`, "POST", foreignSource);
const generated = await call(diagnosticEndpoint, "POST", { questionId: question, actionId: `diagnose:${source.id}` });
assert.equal(generated.mode, "fallback");
const planId = generated.plan.id;
const listed = (await call(diagnosticEndpoint)).plans.find((p: { id: string }) => p.id === planId);
assert.ok(listed);
assert.equal(listed.items.length, 2);
const response = { ...source, id: crypto.randomUUID(), occurredAt: new Date(Date.now() + 15_000).toISOString(),
  attemptStage: "诊断检测", correctness: "正确", responseText: "x²+6x+9", diagnosticItemId: listed.items[0].id };
await call(endpoint, "POST", response, 409); // a draft is not an administered test
await call(diagnosticEndpoint, "PATCH", { planId, status: "adopted" });
await call(diagnosticEndpoint, "PATCH", { planId, status: "adopted" }); // idempotent decision
await call(diagnosticEndpoint, "PATCH", { planId, status: "dismissed" }, 409);
await call(`/api/students/${otherStudent}/agent/diagnostics`, "PATCH", { planId, status: "adopted" }, 404);
await call(endpoint, "POST", { ...response, attemptStage: "首次作答" }, 400);
await call(endpoint, "POST", { ...response, diagnosticItemId: "missing" }, 400);
await call(endpoint, "POST", { ...response, targetAttemptId: foreignSource.id }, 400);
await call(endpoint, "POST", { ...response, occurredAt: source.occurredAt }, 400);
await call(`/api/students/${otherStudent}/learning`, "POST", { ...response, questionId: foreignQuestion, inquiryId: foreignInquiry }, 400);
await call(endpoint, "POST", { ...response, diagnosticItemId: undefined, targetAttemptId: foreignSource.id }, 400);
await call(endpoint, "POST", response);
await call(endpoint, "POST", response);
await call(endpoint, "POST", { ...response, responseText: "changed" }, 409);
let events: LearningEvent[] = (await call(endpoint)).events;
assert.equal(events.filter((e) => e.id === response.id).length, 1);
const recorded = events.find((e) => e.id === response.id)!;
assert.equal(recorded.targetAttemptId, source.id); assert.equal(recorded.diagnosticPlanId, planId);
assert.equal(recorded.diagnosticQuestion, listed.items[0].question);
assert.equal(buildDiagnosticQueue(events).find((e) => e.attemptId === source.id)!.status, "错因未知");
await call(endpoint, "POST", { ...response, id: crypto.randomUUID(), diagnosticItemId: listed.items[1].id });
events = (await call(endpoint)).events;
assert.equal(buildDiagnosticQueue(events).find((e) => e.attemptId === source.id)!.status, "未发现持续性证据");
const exported = await fetch(base + `/api/students/${student}/export`); assert.equal(exported.status, 200);
const files = unzipSync(new Uint8Array(await exported.arrayBuffer()));
const text = Object.values(files).map((value) => strFromU8(value)).join("");
assert.ok(text.includes("诊断题ID") && text.includes(listed.items[0].id) && text.includes(source.id));
writeFileSync(".test-runtime/evidence-fixture/result.json", JSON.stringify({ studentId: student, questionId: question, planId, sourceAttemptId: source.id }, null, 2));
console.log("Diagnostic link API checks passed: materialization, adoption, ownership, stage/date guards, idempotency, two-item completion, and XLSX provenance.");

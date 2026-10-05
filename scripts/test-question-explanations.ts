import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { buildClassificationFromCandidate } from "../lib/classification";
import type { ExplanationContent, SavedExplanation } from "../lib/question-explanation";

const base = "http://127.0.0.1:8790";
type ApiResult = { student: { id: number }; question: { id: number }; explanation: SavedExplanation | null;
  content: ExplanationContent; model: string; questions: { id: number; teacherConfirmedClassification: { extracted_question: string } }[] };
const content: ExplanationContent = { status: "ready", answer: "x=5", approach: "先移项，再将两边除以 3。", steps: [
  { title: "移项", content: "3x=20−5=15。" }, { title: "求解", content: "x=15/3=5。" },
], teachingNotes: "先问学生：怎样把含 x 的项留在等号一边？", commonMistakes: "移项时忘记改变符号。", verification: "将 x=5 代回，3×5+5=20。", alternativeMethod: "", missingInformation: "" };
let calls = 0, mode = "ready";
const server = createServer(async (request, response) => {
  let body = ""; for await (const chunk of request) body += chunk;
  const input = JSON.parse(body); calls++;
  assert.equal(request.url, "/v1/responses"); assert.equal(input.model, "fixture-model");
  assert.equal(input.input[0].content[1].type, "input_image"); assert.ok(input.input[0].content[1].image_url.startsWith("data:image/png;base64,"));
  if (mode === "failure") { response.writeHead(503); response.end("fixture unavailable"); return; }
  const result = mode === "incomplete" ? { ...content, status: "needs_context", answer: "", approach: "", steps: [], missingInformation: "请补充等式右边的数值。" } : content;
  response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ output_text: JSON.stringify(result) }));
});
await new Promise<void>((resolve) => server.listen(8791, "127.0.0.1", resolve));
async function call(path: string, method = "GET", body?: unknown, status = 200) {
  const response = await fetch(base + path, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json() as ApiResult; assert.equal(response.status, status, JSON.stringify(data)); return data;
}
try {
  const studentId = (await call("/api/students", "POST", { name: "解析功能验证", grade: "初中" }, 201)).student.id;
  const otherId = (await call("/api/students", "POST", { name: "归属验证", grade: "初中" }, 201)).student.id;
  const classification = buildClassificationFromCandidate("初中", {
    extracted_question: "已知一次函数 y=3x+5，当 y=20 时，求 x。", presentation_form: "解答题", has_diagram: false,
    extraction_confidence: 1, needs_review: false, review_reasons: [], extraction_notes: "",
  }, { chapter_code: "FUNC-LINEAR", core_knowledge_point_codes: ["FUNC-LINEAR-EXPR"], auxiliary_knowledge_point_codes: [], method_codes: [],
    question_type: "化简与求值", difficulty: "基础", confidence: 1, needs_followup: false, needs_review: false, review_reasons: [], classification_notes: "一次函数求值。" });
  const form = new FormData();
  form.set("image", new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRusAAAAASUVORK5CYII=", "base64")], "fixture.png", { type: "image/png" }));
  form.set("studentId", String(studentId)); form.set("submissionId", crypto.randomUUID()); form.set("teacherConfirmedClassification", JSON.stringify(classification));
  const uploaded = await fetch(base + "/api/questions", { method: "POST", body: form });
  const uploadedData = await uploaded.json() as ApiResult; assert.equal(uploaded.status, 201, JSON.stringify(uploadedData));
  const questionId = uploadedData.question.id, endpoint = `/api/questions/${questionId}/explanation`;
  const sourceText = classification.extracted_question;
  assert.equal((await call(`${endpoint}?studentId=${studentId}`)).explanation, null);
  await call(`${endpoint}?studentId=${otherId}`, "GET", undefined, 404);
  await call(endpoint, "GET", undefined, 400);
  await call(endpoint, "POST", { studentId: otherId, questionText: sourceText }, 404);
  const generated = await call(endpoint, "POST", { studentId, questionText: sourceText });
  assert.equal(generated.content.answer, "x=5"); assert.equal(generated.model, "fixture-model"); assert.equal(calls, 1);
  assert.deepEqual((await call(`${endpoint}?studentId=${studentId}`)).explanation, generated.explanation, "Generated results must be persisted before returning");
  assert.equal(generated.explanation?.revision, 1);
  const save = { studentId, expectedRevision: 1, sourceText, content: generated.content, reviewed: false, origin: "ai", model: generated.model };
  await call(endpoint, "PUT", { ...save, studentId: otherId }, 404);
  const first = (await call(endpoint, "PUT", save)).explanation; assert.ok(first); assert.equal(first.revision, 2); assert.equal(first.reviewed, false);
  await call(endpoint, "PUT", save, 409);
  const revised = { ...save, expectedRevision: 2, content: { ...content, teachingNotes: "教师补充：先让学生写出 3x+5=20，再独立移项。" }, reviewed: true };
  const second = (await call(endpoint, "PUT", revised)).explanation; assert.ok(second); assert.equal(second.revision, 3); assert.equal(second.reviewed, true);
  await call(endpoint, "PUT", revised, 409);
  mode = "failure"; await call(endpoint, "POST", { studentId, questionText: sourceText }, 502);
  assert.deepEqual((await call(`${endpoint}?studentId=${studentId}`)).explanation, second);
  await call(endpoint, "POST", { studentId, questionText: sourceText, expectedRevision: 2 }, 409);
  mode = "incomplete"; const incomplete = await call(endpoint, "POST", { studentId, questionText: sourceText });
  assert.equal(incomplete.explanation?.revision, 4); assert.equal(incomplete.explanation?.reviewed, false);
  await call(endpoint, "PUT", { ...revised, expectedRevision: 4, content: incomplete.content }, 400);
  const question = (await call(`/api/students/${studentId}`)).questions.find((item: { id: number }) => item.id === questionId);
  assert.ok(question);
  assert.equal(question.teacherConfirmedClassification.extracted_question, sourceText);
  // Leave one synthetic example available for UI verification in the isolated fixture.
  writeFileSync("work/explanation-fixture/result.json", JSON.stringify({ studentId, questionId, revision: 4, checks: "generation autosave, image input, readback, stale generation rejected, revisions, ownership, failure preservation, incomplete conditions, classification preservation" }, null, 2));
  console.log(`PASS: explanation API end-to-end. Fixture page: ${base}/students/${studentId}/questions/${questionId}`);
} finally { server.close(); }

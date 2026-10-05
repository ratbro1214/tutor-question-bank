import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import type { PaperQuestion, PaperSummary } from "../lib/paper";
import type { ExplanationContent } from "../lib/question-explanation";
const base = "http://127.0.0.1:8790";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRusAAAAASUVORK5CYII=", "base64");
const explanation: ExplanationContent = { status: "ready", answer: "x=5", approach: "移项。", steps: [{ title: "求解", content: "3x=15，所以 x=5。" }], teachingNotes: "说明移项。", commonMistakes: "符号错误。", verification: "代回成立。", alternativeMethod: "", missingInformation: "" };
const extraction = { extracted_question: "已知 y=3x+5，当 y=20 时求 x。", presentation_form: "解答题", has_diagram: false, extraction_confidence: 1, needs_review: false, review_reasons: [], extraction_notes: "" };
const candidate = { chapter_code: "FUNC-LINEAR", core_knowledge_point_codes: ["FUNC-LINEAR-EXPR"], auxiliary_knowledge_point_codes: [], method_codes: [], question_type: "化简与求值", difficulty: "基础", confidence: 1, needs_followup: false, needs_review: false, review_reasons: [], classification_notes: "一次函数求值。" };
let mode = "ready", solveCalls = 0;
let notifyStarted: (() => void) | undefined, release: (() => void) | undefined;
const server = createServer(async (request, response) => {
  assert.equal(request.headers.authorization, "Bearer fixture-only");
  let raw = ""; for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw); assert.equal(body.model, "fixture-model");
  const name = body.text?.format?.name;
  if (name === "question_explanation") {
    solveCalls++;
    if (mode === "failure") { response.writeHead(503); response.end("fixture unavailable"); return; }
    if (mode === "delayed") { notifyStarted?.(); await new Promise<void>(resolve => { release = resolve; }); }
  }
  const result = name === "fast_math_analysis" ? { extraction, classification: candidate } : explanation;
  response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ output_text: JSON.stringify(result) }));
});
await new Promise<void>(resolve => server.listen(8791, "127.0.0.1", resolve));
async function json<T>(path: string, method = "GET", body?: unknown, expected = 200) {
  const response = await fetch(base + path, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json() as T; assert.equal(response.status, expected, JSON.stringify(data)); return data;
}
async function crop(paperId: string, number: number, metadata: object = {}, status = 201) {
  const form = new FormData(); form.set("image", new File([png], "fixture.png", { type: "image/png" }));
  form.set("metadata", JSON.stringify({ number, regions: [{ page: 1, x: 0, y: 0, width: 1, height: 1 }], text: "fixture", ...metadata }));
  const response = await fetch(`${base}/api/papers/${paperId}/questions`, { method: "POST", body: form });
  const data = await response.json() as { question: PaperQuestion }; assert.equal(response.status, status, JSON.stringify(data)); return data;
}
try {
  const form = new FormData(); form.set("file", new File([readFileSync("work/paper-fixtures/two-column.pdf")], "fixture.pdf", { type: "application/pdf" })); form.set("title", "隔离套卷验证");
  const uploaded = await fetch(base + "/api/papers", { method: "POST", body: form }); assert.equal(uploaded.status, 201);
  const { paper } = await uploaded.json() as { paper: PaperSummary };
  const repeated = await fetch(base + "/api/papers", { method: "POST", body: form }); assert.equal(repeated.status, 200);
  assert.equal(((await repeated.json()) as { paper: PaperSummary }).paper.id, paper.id);
  const q1 = (await crop(paper.id, 1)).question, q2 = (await crop(paper.id, 2)).question;
  assert.equal((await crop(paper.id, 1, {}, 200)).question.id, q1.id);
  const endpoint = (id: string) => `/api/papers/${paper.id}/questions/${id}/analysis`;
  const first = await json<{ question: PaperQuestion }>(endpoint(q1.id), "POST", { educationStage: "初中" });
  assert.equal(first.question.explanation?.content.answer, "x=5"); assert.equal(first.question.revision, 1);
  const calls = solveCalls; await json(endpoint(q1.id), "POST", {}); assert.equal(solveCalls, calls, "Existing results must not spend another model call");
  mode = "failure"; await json(endpoint(q2.id), "POST", { educationStage: "初中" }, 502);
  let detail = await json<{ questions: PaperQuestion[] }>(`/api/papers/${paper.id}`);
  assert.equal(detail.questions.find(q => q.id === q1.id)?.explanation?.revision, 1);
  assert.equal(detail.questions.find(q => q.id === q2.id)?.status, "failed");
  await json(endpoint(q1.id), "POST", { regenerate: true }, 502);
  detail = await json(`/api/papers/${paper.id}`); assert.deepEqual(detail.questions.find(q => q.id === q1.id)?.explanation?.content, explanation);
  mode = "ready"; const second = await json<{ question: PaperQuestion }>(endpoint(q2.id), "POST", { educationStage: "初中" }); assert.ok(second.question.explanation);
  await crop(paper.id, 2, { replace: true, expectedRevision: 0 }, 409);
  const changed = await crop(paper.id, 2, { replace: true, expectedRevision: second.question.revision }, 200);
  assert.equal(changed.question.status, "pending"); assert.deepEqual(changed.question.explanation?.content, explanation); assert.equal(changed.question.classification, null);
  mode = "delayed"; const began = new Promise<void>(resolve => { notifyStarted = resolve; });
  const operationId = crypto.randomUUID(); const pending = json(endpoint(q2.id), "POST", { educationStage: "初中", operationId }, 409);
  await began; await json(endpoint(q2.id), "POST", { regenerate: true }, 409);
  await json(endpoint(q2.id), "POST", { cancel: true, operationId }); release?.(); await pending;
  mode = "ready"; await json(endpoint(q2.id), "POST", { educationStage: "初中" });
  detail = await json(`/api/papers/${paper.id}`); assert.equal(detail.questions.length, 2); assert.ok(detail.questions.every(q => q.explanation));
  await json(`/api/papers/${crypto.randomUUID()}/questions/${q1.id}/analysis`, "POST", {}, 404);
  writeFileSync("work/explanation-fixture/paper-result.json", JSON.stringify({ paperId: paper.id, questionIds: [q1.id, q2.id], checks: "upload, duplicate file reuse, crop persistence, duplicate crop reuse, classification, generation autosave, failure isolation, retry, original preservation, recrop concurrency, cancellation and late-result protection" }, null, 2));
  console.log("PASS: paper API end-to-end with isolated database and deterministic model.");
} finally { server.close(); }

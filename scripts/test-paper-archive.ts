import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8790";
assert.match(base, /^http:\/\/127\.0\.0\.1:8790$/, "Only the isolated fixture server is allowed");
const fixture = JSON.parse(readFileSync("work/explanation-fixture/paper-result.json", "utf8")) as { paperId: string };
async function get(path: string) { const response = await fetch(base + path); assert.equal(response.status, 200); return response.json() as Promise<Record<string, any>>; }
const paper = await get(`/api/papers/${fixture.paperId}`);
const selected = paper.questions.find((q: any) => q.status === "ready" && !q.error);
assert.ok(selected?.explanation && selected.classification);
const target = await fetch(base + "/api/students", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "套卷联动隔离验证", grade: "高中" }) }).then(r => r.json()) as any;
const studentId = target.student.id;
async function archive(questions: unknown, confirmed = true, owner = studentId) {
  return fetch(`${base}/api/papers/${fixture.paperId}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: owner, confirmed, questions }) });
}
const selection = [{ id: selected.id, revision: selected.revision }];
assert.equal((await archive(selection, false)).status, 400);
assert.equal((await archive(selection, true, 999999)).status, 404);
assert.equal((await archive([{ id: selected.id, revision: selected.revision + 1 }])).status, 409);
assert.equal((await archive([{ id: crypto.randomUUID(), revision: 0 }])).status, 404);
const imported = await archive(selection); assert.equal(imported.status, 200);
const result = await imported.json() as any;
const questionId = result.questions[0].questionId;
assert.equal(result.questions[0].existing, false);
const personal = await get(`/api/students/${studentId}`), question = personal.questions.find((q: any) => q.id === questionId);
assert.equal(question.paperSource.paperId, fixture.paperId);
assert.equal(question.paperSource.number, selected.number);
assert.equal(question.knowledgePoints.length, selected.classification.knowledge_points.length);
assert.notEqual(question.imageUrl, selected.imageUrl);
const sourceImage = await fetch(base + selected.imageUrl).then(r => r.arrayBuffer());
const copiedImage = await fetch(base + question.imageUrl).then(r => r.arrayBuffer());
assert.deepEqual(new Uint8Array(copiedImage), new Uint8Array(sourceImage));
const explanation = await get(`/api/questions/${questionId}/explanation?studentId=${studentId}`);
assert.deepEqual(explanation.explanation.content, selected.explanation.content);
const edit = { ...explanation.explanation.content, teachingNotes: "个人题库的独立修改" };
const edited = await fetch(`${base}/api/questions/${questionId}/explanation`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, content: edit, sourceText: explanation.explanation.sourceText, expectedRevision: 1, reviewed: false, origin: "ai", model: selected.explanation.model }) });
assert.equal(edited.status, 200, await edited.text());
const duplicate = await archive(selection); assert.equal(duplicate.status, 200);
const repeated = await duplicate.json() as any;
assert.equal(repeated.questions[0].existing, true); assert.equal(repeated.questions[0].questionId, questionId);
assert.equal((await get(`/api/questions/${questionId}/explanation?studentId=${studentId}`)).explanation.content.teachingNotes, edit.teachingNotes);
assert.equal((await get(`/api/papers/${fixture.paperId}`)).questions.find((q: any) => q.id === selected.id).explanation.content.teachingNotes, selected.explanation.content.teachingNotes);
assert.equal((await get(`/api/students/${studentId}`)).questions.length, 1);
console.log("PASS: original image, classification, knowledge points, saved explanation, source link, duplicate protection, independent editing, invalid targets and stale revisions.");

import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { buildClassificationFromCandidate } from "../lib/classification";
import { type LearningEvent, learningStats } from "../lib/learning";
const base = process.env.LEARNING_TEST_URL;
if (base !== "http://127.0.0.1:8789")
  throw Error(
    "This script requires the isolated fixture server at 127.0.0.1:8789.",
  );
async function json(path: string, body?: unknown) {
  const r = await fetch(
    base + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const data = (await r.json()) as {
    student: { id: number };
    question: { id: number };
    events: LearningEvent[];
  };
  assert.ok(r.ok, JSON.stringify(data));
  return data;
}
const a = (
  await json("/api/students", { name: "API_FIXTURE_A", grade: "初中" })
).student.id;
const b = (
  await json("/api/students", { name: "API_FIXTURE_B", grade: "初中" })
).student.id;
const c = (
  await json("/api/students", { name: "API_FIXTURE_C", grade: "初中" })
).student.id;
const classification = buildClassificationFromCandidate(
  "初中",
  {
    extracted_question: "fixture",
    presentation_form: "解答题",
    has_diagram: false,
    extraction_confidence: 0.96,
    needs_review: false,
    review_reasons: [],
    extraction_notes: "",
  },
  {
    chapter_code: "FUNC-LINEAR",
    core_knowledge_point_codes: ["FUNC-LINEAR-EXPR"],
    auxiliary_knowledge_point_codes: [],
    method_codes: [],
    question_type: "已知条件求解析式",
    difficulty: "基础",
    confidence: 0.92,
    needs_followup: false,
    needs_review: false,
    review_reasons: [],
    classification_notes: "",
  },
);
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRusAAAAASUVORK5CYII=",
  "base64",
);
async function upload(
  student: number,
  id: string,
  decision = "",
  linked?: number,
  includeAi = true,
  extractedQuestion = classification.extracted_question,
  imageVariant = "",
  relatedQuestionId?: number,
  relationKind = "",
) {
  const f = new FormData();
  f.set("image", new File([image, Buffer.from(imageVariant)], "fixture.png", { type: "image/png" }));
  f.set("studentId", String(student));
  f.set("submissionId", id);
  const confirmed = { ...classification, extracted_question: extractedQuestion };
  if (includeAi) f.set("aiClassification", JSON.stringify(confirmed));
  f.set("classificationSource", includeAi ? "live_ai" : "manual");
  f.set("teacherConfirmedClassification", JSON.stringify(confirmed));
  f.set("duplicateDecision", decision);
  if (linked) f.set("linkedQuestionId", String(linked));
  if (relatedQuestionId) f.set("relatedQuestionId", String(relatedQuestionId));
  if (relationKind) f.set("relationKind", relationKind);
  const r = await fetch(base + "/api/questions", { method: "POST", body: f });
  return {
    status: r.status,
    data: (await r.json()) as {
      student: { id: number };
      question: { id: number };
      events: LearningEvent[];
      similarQuestions?: Array<{ id: number; chapterName: string; similarity: number }>;
    },
  };
}
const first = crypto.randomUUID();
const saved = await upload(a, first);
assert.equal(saved.status, 201);
const q = saved.data.question.id;
assert.equal((await upload(a, first)).data.question.id, q);
const repeated = crypto.randomUUID();
assert.equal((await upload(a, repeated)).status, 409);
assert.equal((await upload(a, repeated, "link", q)).data.question.id, q);
const similarText = "解方程：3x + 5 = 20，求 x 的值。";
const similarBase = await upload(a, crypto.randomUUID(), "", undefined, true, similarText, "similar-base-image");
assert.equal(similarBase.status, 201);
const similarAttempt = await upload(a, crypto.randomUUID(), "", undefined, true, "解方程 3x+5=20，求x。", "cropped-variant");
assert.equal(similarAttempt.status, 409, JSON.stringify(similarAttempt.data));
assert.equal(similarAttempt.data.similarQuestions?.[0]?.id, similarBase.data.question.id);
const similarSave = await upload(a, crypto.randomUUID(), "similar", undefined, true, "解方程 3x+5=20，求x。", "cropped-variant", similarBase.data.question.id, "变式题");
assert.equal(similarSave.status, 201, JSON.stringify(similarSave.data));
const relatedData = await fetch(base + `/api/students/${a}/learning`).then((r) => r.json()) as {
  relations: Array<{ question_id: number; related_id: number; kind: string }>;
};
assert.ok(relatedData.relations.some((relation) =>
  ((relation.question_id === similarSave.data.question.id && relation.related_id === similarBase.data.question.id)
    || (relation.question_id === similarBase.data.question.id && relation.related_id === similarSave.data.question.id))
  && relation.kind === "变式题"));
const other = await upload(b, crypto.randomUUID());
assert.equal(other.status, 201);
const manual = await upload(c, crypto.randomUUID(), "", undefined, false);
assert.equal(manual.status, 201, JSON.stringify(manual.data));
const manualStudentResponse = await fetch(base + `/api/students/${c}`);
assert.equal(manualStudentResponse.status, 200);
const manualStudent = await manualStudentResponse.json() as {
  questions: Array<{ aiClassification: unknown; classificationSource: string }>;
};
assert.equal(manualStudent.questions[0].classificationSource, "manual");
assert.equal(manualStudent.questions[0].aiClassification, null);
const manualExport = await fetch(base + `/api/students/${c}/export`);
assert.equal(manualExport.status, 200);
const manualWorkbook = unzipSync(new Uint8Array(await manualExport.arrayBuffer()));
assert.ok(Object.values(manualWorkbook).map((value) => strFromU8(value)).join("").includes("人工分类"));
const now = "2026-09-12T10:00:00+08:00";
const endpoint = `/api/students/${a}/learning`;
const teaching = {
  id: crypto.randomUUID(),
  kind: "teaching",
  questionId: q,
  inquiryId: first,
  occurredAt: now,
  reasons: ["不会选择解题方法"],
  methods: ["启发式提问"],
  outcome: "仍需提示",
  notes: '=HYPERLINK("fixture")',
};
await json(endpoint, teaching);
await json(endpoint, teaching);
const review = crypto.randomUUID();
await json(endpoint, {
  id: review,
  kind: "review",
  questionId: q,
  inquiryId: first,
  occurredAt: now,
  dueAt: "2026-09-19T10:00:00+08:00",
});
let history = await json(endpoint);
assert.equal(learningStats([q], history.events).pending, 1);
await json(endpoint, {
  id: crypto.randomUUID(),
  kind: "result",
  questionId: q,
  inquiryId: first,
  reviewId: review,
  occurredAt: "2026-09-19T10:00:00+08:00",
  outcome: "复查通过",
});
history = await json(endpoint);
assert.deepEqual(learningStats([q], history.events), {
  questions: 1,
  inquiries: 2,
  repeats: 1,
  pending: 0,
  completed: 1,
});
assert.equal(
  history.events.filter((e: LearningEvent) => e.kind === "teaching").length,
  1,
);
const cross = await fetch(base + `/api/students/${b}/learning`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...teaching, id: crypto.randomUUID() }),
});
assert.equal(cross.status, 404);
const exported = await fetch(base + `/api/students/${a}/export`);
assert.equal(exported.status, 200);
const files = unzipSync(new Uint8Array(await exported.arrayBuffer()));
const all = Object.values(files)
  .map((value) => strFromU8(value))
  .join("");
assert.ok(all.includes("API_FIXTURE_A"));
assert.ok(!all.includes("API_FIXTURE_B"));
assert.ok(!all.includes("<f>"));
assert.ok(all.includes("复查通过"));
const limited = await fetch(
  base + `/api/students/${a}/export?from=2026-09-12&to=2026-09-12`,
);
const limitedFiles = unzipSync(new Uint8Array(await limited.arrayBuffer()));
assert.ok(
  !strFromU8(limitedFiles["xl/worksheets/sheet5.xml"]).includes("复查通过"),
);
console.log(
  "PASS: AI and manual archive provenance, exact and text-similar question association, retry idempotency, teaching, review lifecycle, student isolation, XLSX date filtering and injection protection. Synthetic fixtures ran against an isolated database under .test-runtime.",
);

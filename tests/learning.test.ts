import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  buildDiagnosticQueue,
  buildLearnerProfile,
  diagnosticQuestionsForKnowledgePoint,
  errorPatternsForKnowledgePoint,
  learningInput,
  learningStats,
  supportsQuickAttempt,
  withinRange,
  type LearningEvent,
} from "../lib/learning";
import { seniorTaxonomy } from "../lib/senior-taxonomy";
import { workbook } from "../lib/xlsx-export";
import { strFromU8, unzipSync } from "fflate";

test("快速作答覆盖高中分类并按模块提供不同错因与诊断", () => {
  assert.ok(seniorTaxonomy.length >= 160);
  assert.equal(
    seniorTaxonomy.every(([code]) => supportsQuickAttempt(code)),
    true,
  );
  assert.equal(supportsQuickAttempt("ALG-FORMULA"), true);
  assert.equal(supportsQuickAttempt("GEO-CIRCLE"), false);

  const derivativePatterns = errorPatternsForKnowledgePoint(
    "HS-DERIVATIVE-MONOTONICITY",
  );
  const probabilityPatterns = errorPatternsForKnowledgePoint(
    "HS-PROB-CONDITIONAL",
  );
  assert.ok(derivativePatterns.some((item) => item.code === "DERIVATIVE_SIGN"));
  assert.ok(probabilityPatterns.some((item) => item.code === "PROB_MODEL"));
  assert.notDeepEqual(
    diagnosticQuestionsForKnowledgePoint("HS-DERIVATIVE-MONOTONICITY"),
    diagnosticQuestionsForKnowledgePoint("HS-PROB-CONDITIONAL"),
  );
});

test("学习统计区分题数、提问与复查，排除其他学生题目", () => {
  const events: LearningEvent[] = [
    {
      id: "a",
      questionId: 1,
      kind: "inquiry",
      occurredAt: "2026-09-01",
      notes: "",
    },
    {
      id: "b",
      questionId: 1,
      kind: "inquiry",
      occurredAt: "2026-09-02",
      notes: "",
    },
    {
      id: "c",
      questionId: 2,
      kind: "inquiry",
      occurredAt: "2026-09-03",
      notes: "",
    },
    {
      id: "d",
      questionId: 3,
      kind: "inquiry",
      occurredAt: "2026-09-03",
      notes: "",
    },
    {
      id: "r",
      questionId: 1,
      kind: "review",
      occurredAt: "2026-09-03",
      notes: "",
    },
    {
      id: "r2",
      questionId: 2,
      kind: "review",
      occurredAt: "2026-09-03",
      notes: "",
    },
    {
      id: "done",
      questionId: 1,
      kind: "result",
      reviewId: "r",
      occurredAt: "2026-09-04",
      notes: "",
    },
  ];
  assert.deepEqual(learningStats([1, 2], events), {
    questions: 2,
    inquiries: 3,
    repeats: 1,
    pending: 1,
    completed: 1,
  });
  assert.equal(
    withinRange("2026-09-30T23:59:59Z", "2026-09-01", "2026-09-30"),
    true,
  );
  assert.equal(withinRange("2026-08-31", "2026-09-01", ""), false);
});
test("共享校验拒绝非法日期、超长标签和未知结果", () => {
  const payload = {
    id: crypto.randomUUID(),
    questionId: 1,
    kind: "inquiry",
    occurredAt: new Date().toISOString(),
  };
  assert.equal(learningInput.safeParse(payload).success, true);
  for (const change of [
    { occurredAt: "昨天" },
    { reasons: ["x".repeat(81)] },
    { outcome: "AI判定掌握" },
    { questionId: -1 },
  ])
    assert.equal(
      learningInput.safeParse({ ...payload, ...change }).success,
      false,
    );
});
test("仅结果可快速记录，教师确认的具体错因才进入画像", () => {
  const base = {
    id: crypto.randomUUID(),
    questionId: 1,
    inquiryId: crypto.randomUUID(),
    kind: "attempt" as const,
    occurredAt: "2026-09-01T08:00:00.000Z",
    attemptStage: "首次作答" as const,
    responseText: "(x+3)^2=x^2+9",
    correctness: "错误" as const,
    supportLevel: "独立完成" as const,
    evidenceLevel: "有完整过程或教师观察" as const,
    evidenceSource: "作业" as const,
    knowledgePointCode: "ALG-FORMULA",
    teacherDecision: "教师确认" as const,
    errorCode: "FORMULA_OMIT_MIDDLE",
    errorLabel: "遗漏中间项",
    evidenceExcerpt: "x^2+9",
  };
  assert.equal(learningInput.safeParse(base).success, true);
  assert.equal(
    learningInput.safeParse({ ...base, responseText: "" }).success,
    false,
  );
  assert.equal(
    learningInput.safeParse({ ...base, errorCode: undefined }).success,
    false,
  );
  const quickResultOnly = {
    ...base,
    id: crypto.randomUUID(),
    evidenceLevel: "仅有最终答案" as const,
    evidenceSource: "考试答题卡" as const,
    teacherDecision: undefined,
    errorCode: undefined,
    errorLabel: undefined,
    evidenceExcerpt: undefined,
  };
  assert.equal(learningInput.safeParse(quickResultOnly).success, true);
  const [diagnostic] = buildDiagnosticQueue([
    { ...quickResultOnly, notes: "", diagnosisStatus: "错因未知" },
  ]);
  assert.equal(diagnostic.status, "错因未知");
  assert.equal(diagnostic.evidenceSource, "考试答题卡");
  assert.equal(diagnostic.questions.length, 2);

  const events: LearningEvent[] = [
    { ...base, notes: "" },
    {
      ...base,
      id: crypto.randomUUID(),
      questionId: 2,
      occurredAt: "2026-09-03T08:00:00.000Z",
      notes: "",
    },
    {
      id: crypto.randomUUID(),
      questionId: 3,
      inquiryId: crypto.randomUUID(),
      kind: "attempt",
      occurredAt: "2026-09-10T08:00:00.000Z",
      notes: "",
      attemptStage: "间隔复查",
      responseText: "(a+4)^2=a^2+8a+16",
      correctness: "正确",
      supportLevel: "独立完成",
      knowledgePointCode: "ALG-FORMULA",
    },
  ];
  const [profile] = buildLearnerProfile(events);
  assert.equal(profile.status, "阶段性稳定");
  assert.equal(profile.evidenceCount, 2);
  assert.equal(profile.latestQuestionId, 2);
});
test("迁移兼容旧题；历史不覆盖；外键、重试和复查唯一性", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const files = readdirSync("drizzle")
    .filter((p) => p.endsWith(".sql"))
    .sort();
  for (const file of files) db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  db.exec(
    `INSERT INTO students(id,name) VALUES(1,'fixture'); INSERT INTO questions(id,student_id,image_key,original_filename,image_mime_type,extracted_question,chapter_code,chapter_name,question_type,difficulty,ai_classification,teacher_confirmed_classification) VALUES(1,1,'fixture','fixture','image/png','x','x','x','x','x','{}','{}');`,
  );
  assert.equal(
    db.prepare("SELECT classification_source FROM questions WHERE id=1").get()!.classification_source,
    "legacy",
  );
  db.prepare("UPDATE questions SET ai_classification='null', classification_source='manual' WHERE id=1").run();
  const manualProvenance = db.prepare("SELECT ai_classification, classification_source FROM questions WHERE id=1").get()!;
  assert.equal(manualProvenance.ai_classification, "null");
  assert.equal(manualProvenance.classification_source, "manual");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM inquiries").get()!.n, 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM student_attempts").get()!.n,
    0,
  );
  const insert = db.prepare(
    "INSERT INTO inquiries(id,question_id,occurred_at,reasons,notes) VALUES(?,1,?,'[]','') ON CONFLICT(id) DO NOTHING",
  );
  insert.run("a", "2026-09-01");
  insert.run("b", "2026-09-02");
  insert.run("b", "2026-09-03");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM inquiries").get()!.n, 2);
  db.prepare(
    `INSERT INTO student_attempts
     (id,question_id,inquiry_id,occurred_at,stage,knowledge_point_code,response_text,correctness,support_level,notes)
     VALUES ('attempt-a',1,'a','2026-09-01','首次作答','ALG-FORMULA','x²+9','错误','独立完成','')`,
  ).run();
  db.prepare(
    `INSERT INTO error_evidence
     (id,attempt_id,knowledge_point_code,teacher_decision,error_code,error_label,evidence_excerpt,notes)
     VALUES ('evidence-a','attempt-a','ALG-FORMULA','教师确认','FORMULA_OMIT_MIDDLE','遗漏中间项','x²+9','')`,
  ).run();
  assert.equal(
    db.prepare("SELECT knowledge_point_code FROM student_attempts WHERE id='attempt-a'").get()!.knowledge_point_code,
    "ALG-FORMULA",
  );
  assert.throws(() =>
    db.exec(
      "INSERT INTO error_evidence(id,attempt_id,knowledge_point_code,teacher_decision,notes) VALUES('bad-evidence','missing','ALG-FORMULA','证据不足','')",
    ),
  );
  db.exec(
    `INSERT INTO teaching_records(id,inquiry_id,occurred_at,methods,outcome,notes,supersedes_id) VALUES('t','a','2026-09-01','[]','仍需提示','旧',NULL); INSERT INTO teaching_records(id,inquiry_id,occurred_at,methods,outcome,notes,supersedes_id) VALUES('t2','a','2026-09-02','[]','能够独立完成','新','t'); INSERT INTO reviews VALUES('r','a','2026-09-02','2026-09-09'); INSERT INTO review_results VALUES('c','r','2026-09-09','复查通过','');`,
  );
  assert.equal(
    db.prepare("SELECT notes FROM teaching_records WHERE id='t'").get()!.notes,
    "旧",
  );
  assert.throws(() =>
    db.exec(
      "INSERT INTO review_results VALUES('c2','r','2026-09-10','复查通过','')",
    ),
  );
  assert.throws(() =>
    db.exec("INSERT INTO reviews VALUES('bad','missing','now','later')"),
  );
  db.close();
});
test("Excel 使用真实 xlsx 多工作表且公式文本不能执行", () => {
  const archive = unzipSync(
    workbook([
      { name: "学生档案", rows: [["姓名"], ['=HYPERLINK("evil")'], ["<>&"]] },
      { name: "复查记录", rows: [["ID"]] },
    ]),
  );
  const sheet = strFromU8(archive["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /t="inlineStr"/);
  assert.doesNotMatch(sheet, /<f[ >]/);
  assert.match(sheet, /&lt;&gt;&amp;/);
  assert.match(strFromU8(archive["xl/workbook.xml"]), /复查记录/);
});

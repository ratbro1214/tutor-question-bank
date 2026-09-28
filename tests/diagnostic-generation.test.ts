import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  buildDiagnosticPrompt,
  diagnosticPackageSchema,
  fallbackDiagnosticPackage,
  generateDiagnosticPackage,
  type DiagnosticGenerationContext,
} from "../lib/diagnostic-generation";

const context: DiagnosticGenerationContext = {
  educationStage: "初中",
  chapterName: "整式的乘法与因式分解",
  knowledgePointName: "乘法公式",
  originalQuestion: "展开 (x+3)²",
  studentResponse: "x²+9",
  correctness: "错误",
  supportLevel: "独立完成",
  evidenceLevel: "有完整过程或教师观察",
  evidenceSource: "作业",
  candidateErrors: ["遗漏中间项"],
  ruleQuestions: ["写出 (a+b)²。", "展开 (x+2)²。"],
};

test("诊断提示把候选错因保留为假设且不包含学生身份", () => {
  const prompt = buildDiagnosticPrompt(context);
  assert.match(prompt, /仅为待验证假设/);
  assert.match(prompt, /不得把候选错因写成已确认事实/);
  assert.doesNotMatch(prompt, /学生姓名|掌握率：/);
});

test("没有模型密钥时返回恰好两道可审核的规则诊断", async () => {
  const result = await generateDiagnosticPackage(context, {
    baseUrl: "https://api.openai.com/v1",
    apiStyle: "responses",
    model: "test-model",
    strictJsonSchema: true,
  });
  assert.equal(result.mode, "fallback");
  assert.equal(result.package.questions.length, 2);
  assert.equal(diagnosticPackageSchema.safeParse(result.package).success, true);
  assert.match(result.package.teacher_note, /教师先核对/);
});

test("结构校验拒绝缺少判别信息或多于两题的结果", () => {
  const valid = fallbackDiagnosticPackage(context);
  assert.equal(diagnosticPackageSchema.safeParse(valid).success, true);
  assert.equal(diagnosticPackageSchema.safeParse({ ...valid, questions: valid.questions.slice(0, 1) }).success, false);
  assert.equal(diagnosticPackageSchema.safeParse({ ...valid, questions: valid.questions.map((item) => ({ ...item, error_signal: undefined })) }).success, false);
});

test("诊断方案独立留痕并依赖真实作答证据", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort())
    db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  db.exec(`
    INSERT INTO students(id,name) VALUES(1,'fixture');
    INSERT INTO questions(id,student_id,image_key,original_filename,image_mime_type,extracted_question,chapter_code,chapter_name,question_type,difficulty,ai_classification,teacher_confirmed_classification)
      VALUES(1,1,'fixture','fixture','image/png','x','x','x','x','x','{}','{}');
    INSERT INTO inquiries(id,question_id,occurred_at,reasons,notes) VALUES('inquiry-1',1,'2026-09-01','[]','');
    INSERT INTO student_attempts(id,question_id,inquiry_id,occurred_at,stage,knowledge_point_code,response_text,correctness,support_level,notes)
      VALUES('attempt-1',1,'inquiry-1','2026-09-01','首次作答','ALG-FORMULA','x²+9','错误','独立完成','');
  `);
  db.prepare("INSERT INTO diagnostic_plans(id,question_id,source_attempt_id,action_id,content,generation_mode,status,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .run("plan-1", 1, "attempt-1", "diagnose:attempt-1", JSON.stringify(fallbackDiagnosticPackage(context)), "fallback", "draft", "2026-09-01");
  assert.equal(db.prepare("SELECT status FROM diagnostic_plans WHERE id='plan-1'").get()!.status, "draft");
  db.prepare("UPDATE diagnostic_plans SET status='adopted', decided_at=? WHERE id='plan-1'").run("2026-09-02");
  assert.equal(db.prepare("SELECT status FROM diagnostic_plans WHERE id='plan-1'").get()!.status, "adopted");
  assert.throws(() => db.prepare("INSERT INTO diagnostic_plans(id,question_id,source_attempt_id,action_id,content,generation_mode,status,created_at) VALUES('bad',1,'missing','x','{}','fallback','draft','2026-09-01')").run());
});

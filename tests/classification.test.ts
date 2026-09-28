import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClassificationFromCandidate,
  localizeClassificationNotes,
  normalizeExtractedQuestion,
  synchronizeCandidateWithClassificationNotes,
  validateClassificationCandidate,
  type MathClassificationCandidate,
  type VisionExtraction,
} from "../lib/classification";

const extraction: VisionExtraction = {
  extracted_question: "测试题目原文",
  presentation_form: "解答题",
  has_diagram: false,
  extraction_confidence: 0.96,
  needs_review: false,
  review_reasons: [],
  extraction_notes: "",
};

function candidate(overrides: Partial<MathClassificationCandidate>): MathClassificationCandidate {
  return {
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
    classification_notes: "核心目标是由已知条件确定一次函数解析式。",
    ...overrides,
  };
}

test("阻止截图场景中的主章节与题型冲突", () => {
  const value = candidate({
    chapter_code: "HS-SETS-LOGIC",
    core_knowledge_point_codes: ["HS-FUNC-MONOTONICITY"],
    question_type: "函数性质与图像分析",
  });
  const issues = validateClassificationCandidate("高中", value);
  assert.ok(issues.some(issue => issue.code === "CORE_POINT_CHAPTER_MISMATCH"));
  assert.ok(issues.some(issue => issue.code === "QUESTION_TYPE_CHAPTER_CONFLICT"));
});

test("普通单知识点题目可以通过并由后端映射规范名称", () => {
  const value = candidate({});
  assert.deepEqual(validateClassificationCandidate("初中", value), []);
  const result = buildClassificationFromCandidate("初中", extraction, value);
  assert.deepEqual(result.chapter, { code: "FUNC-LINEAR", name: "一次函数" });
  assert.deepEqual(result.knowledge_points, [{ code: "FUNC-LINEAR-EXPR", name: "一次函数解析式" }]);
});

test("教师可读题干会清理常见 LaTeX 源码并保留题目结构", () => {
  const raw = "10. 已知椭圆 C₁：\\frac{x^{2}}{4}+\\frac{y^{2}}{2}=1\nA. \\overline{C_1C_2} 是相似椭圆";
  assert.equal(
    normalizeExtractedQuestion(raw),
    "10. 已知椭圆 C₁：x²/4+y²/2=1\nA. C₁C₂ 是相似椭圆",
  );
});

test("分类依据不会向教师泄漏内部知识点 ID", () => {
  assert.equal(
    localizeClassificationNotes("高中", "核心知识点为 HS-ANALYTIC-ELLIPSE，属于 HS-ANALYTIC-GEOMETRY。"),
    "核心知识点为 椭圆，属于 平面解析几何。",
  );
});

test("同一主章节的多知识点综合题可以通过", () => {
  const value = candidate({
    chapter_code: "HS-SOLID-GEOMETRY",
    core_knowledge_point_codes: ["HS-SOLID-SPHERE-SECTION", "HS-SOLID-DISTANCE"],
    question_type: "几何计算",
    difficulty: "中等",
  });
  assert.deepEqual(validateClassificationCandidate("高中", value), []);
});

test("有依据的跨章节辅助知识点可以通过", () => {
  const value = candidate({
    chapter_code: "HS-DERIVATIVE",
    core_knowledge_point_codes: ["HS-DERIVATIVE-MONOTONICITY"],
    auxiliary_knowledge_point_codes: ["HS-FUNC-MONOTONICITY"],
    method_codes: ["METHOD-FUNCTION"],
    question_type: "函数性质与图像分析",
    difficulty: "中等",
  });
  assert.deepEqual(validateClassificationCandidate("高中", value), []);
  const result = buildClassificationFromCandidate("高中", extraction, value);
  assert.deepEqual(result.knowledge_points.map(point => point.code), [
    "HS-DERIVATIVE-MONOTONICITY",
    "HS-FUNC-MONOTONICITY",
    "METHOD-FUNCTION",
  ]);
});

test("通用方法不能冒充核心知识点，重复标签也不能通过", () => {
  const value = candidate({
    core_knowledge_point_codes: ["METHOD-NUMBER-SHAPE"],
    method_codes: ["METHOD-NUMBER-SHAPE"],
  });
  const issues = validateClassificationCandidate("初中", value);
  assert.ok(issues.some(issue => issue.code === "METHOD_AS_CONTENT"));
  assert.ok(issues.some(issue => issue.code === "DUPLICATE_KNOWLEDGE_POINT"));
});

test("按需复核标记必须同时保留人工复核状态", () => {
  const issues = validateClassificationCandidate("初中", candidate({ needs_followup: true, needs_review: false }));
  assert.ok(issues.some(issue => issue.code === "DEEP_ANALYSIS_REVIEW_CONFLICT"));
});

test("分类依据提到奇偶性和周期性时同步勾选对应知识点", () => {
  const value = candidate({
    chapter_code: "HS-FUNCTION",
    core_knowledge_point_codes: ["HS-FUNC-CONCEPT"],
    question_type: "函数性质与图像分析",
    classification_notes:
      "该题考查函数图象关于直线的对称性与函数奇偶性、最小正周期等概念。",
  });
  const rawIssues = validateClassificationCandidate("高中", value);
  assert.equal(
    rawIssues.filter(
      (issue) => issue.code === "NOTES_KNOWLEDGE_POINT_MISMATCH",
    ).length,
    2,
  );
  const synchronized = synchronizeCandidateWithClassificationNotes("高中", value);
  assert.deepEqual(synchronized.core_knowledge_point_codes, [
    "HS-FUNC-PARITY",
    "HS-FUNC-PERIODICITY",
    "HS-FUNC-CONCEPT",
  ]);
  assert.deepEqual(validateClassificationCandidate("高中", synchronized), []);
});

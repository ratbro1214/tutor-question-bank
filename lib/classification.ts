import { chaptersForStage, taxonomyForStage } from "@/lib/taxonomy";

export type Difficulty = "基础" | "中等" | "较难";
export type EducationStage = "初中" | "高中";
export type KnowledgePoint = { code: string; name: string };

export const questionTypes = [
  "概念辨析", "直接计算", "化简与求值", "解方程或不等式", "证明题", "作图题",
  "读图与信息提取", "已知条件求解析式", "函数性质与图像分析", "几何计算", "几何证明",
  "统计图表分析", "概率计算", "规律探究", "方案设计与最优化", "实际应用建模", "综合题", "其他",
] as const;

export const presentationForms = ["选择题", "填空题", "解答题", "证明题", "作图题", "未知"] as const;

export const reviewReasons = [
  "IMAGE_UNCLEAR", "CONTENT_CROPPED", "DIAGRAM_REQUIRED", "OCR_AMBIGUOUS",
  "CLASSIFICATION_AMBIGUOUS", "NO_TAXONOMY_MATCH", "OUT_OF_SCOPE_TAXONOMY",
  "POSSIBLE_DUPLICATE", "OTHER",
] as const;

export type ReviewReason = (typeof reviewReasons)[number];
export type QuestionType = (typeof questionTypes)[number];
export type PresentationForm = (typeof presentationForms)[number];

export type VisionExtraction = {
  extracted_question: string;
  presentation_form: PresentationForm;
  has_diagram: boolean;
  extraction_confidence: number;
  needs_review: boolean;
  review_reasons: ReviewReason[];
  extraction_notes: string;
};

export type MathClassificationCandidate = {
  chapter_code: string;
  core_knowledge_point_codes: string[];
  auxiliary_knowledge_point_codes: string[];
  method_codes: string[];
  question_type: QuestionType;
  difficulty: Difficulty;
  confidence: number;
  needs_followup: boolean;
  needs_review: boolean;
  review_reasons: ReviewReason[];
  classification_notes: string;
};

export type ClassificationValidationIssue = {
  code: string;
  field: string;
  message: string;
};

export type ClassificationAnalysisTrace = {
  analysis_id: string;
  strict_json_schema: boolean;
  prompt_version: string;
  cache_hit: boolean;
  reasoning_effort: "low" | "medium";
  timings_ms: Record<string, number>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cached_tokens: number;
    reasoning_tokens: number;
  };
  classification_attempts: Array<{
    attempt: number;
    validation_issues: ClassificationValidationIssue[];
    retry_reason?: string;
  }>;
};

export type Classification = {
  schema_version: "1.0";
  taxonomy_version: "cn-junior-math-1.0" | "cn-senior-math-1.0";
  subject: "初中数学" | "高中数学";
  education_stage: EducationStage;
  extracted_question: string;
  chapter: { code: string; name: string };
  knowledge_points: KnowledgePoint[];
  /** Mathematical thoughts and solution methods are metadata, not statistical knowledge points. */
  methods: KnowledgePoint[];
  question_type: string;
  difficulty: Difficulty;
  confidence: number;
  needs_review: boolean;
  review_reasons: ReviewReason[];
  classification_notes: string;
  analysis_trace?: ClassificationAnalysisTrace;
};

export function taxonomyVersionForStage(stage: EducationStage): Classification["taxonomy_version"] {
  return stage === "高中" ? "cn-senior-math-1.0" : "cn-junior-math-1.0";
}

export function subjectForStage(stage: EducationStage): Classification["subject"] {
  return stage === "高中" ? "高中数学" : "初中数学";
}

export function visionExtractionSchema() {
  return {
    type: "object", additionalProperties: false,
    properties: {
      extracted_question: { type: "string" },
      presentation_form: { type: "string", enum: presentationForms },
      has_diagram: { type: "boolean" },
      extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
      needs_review: { type: "boolean" },
      review_reasons: { type: "array", items: { type: "string", enum: reviewReasons } },
      extraction_notes: { type: "string" },
    },
    required: ["extracted_question", "presentation_form", "has_diagram", "extraction_confidence", "needs_review", "review_reasons", "extraction_notes"],
  } as const;
}

export function classificationCandidateSchemaForStage(stage: EducationStage) {
  const taxonomy = taxonomyForStage(stage);
  const contentCodes = taxonomy.filter(([, , chapter]) => chapter !== "METHOD").map(([code]) => code);
  const methodCodes = taxonomy.filter(([, , chapter]) => chapter === "METHOD").map(([code]) => code);
  return {
    type: "object", additionalProperties: false,
    properties: {
      chapter_code: { type: "string", enum: chaptersForStage(stage).map(([code]) => code) },
      core_knowledge_point_codes: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: contentCodes } },
      auxiliary_knowledge_point_codes: { type: "array", maxItems: 2, items: { type: "string", enum: contentCodes } },
      method_codes: { type: "array", maxItems: 2, items: { type: "string", enum: methodCodes } },
      question_type: { type: "string", enum: questionTypes },
      difficulty: { type: "string", enum: ["基础", "中等", "较难"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      needs_followup: { type: "boolean" },
      needs_review: { type: "boolean" },
      review_reasons: { type: "array", items: { type: "string", enum: reviewReasons } },
      classification_notes: { type: "string" },
    },
    required: [
      "chapter_code", "core_knowledge_point_codes",
      "auxiliary_knowledge_point_codes", "method_codes", "question_type", "difficulty", "confidence",
      "needs_followup", "needs_review", "review_reasons", "classification_notes",
    ],
  } as const;
}

export function classificationSchemaForStage(stage: EducationStage) {
  const chapters = chaptersForStage(stage);
  const taxonomy = taxonomyForStage(stage);
  const contentTaxonomy = taxonomy.filter(([, , owner]) => owner !== "METHOD");
  const methodTaxonomy = taxonomy.filter(([, , owner]) => owner === "METHOD");
  return {
    type: "object", additionalProperties: false,
    properties: {
      schema_version: { type: "string", enum: ["1.0"] },
      taxonomy_version: { type: "string", enum: [taxonomyVersionForStage(stage)] },
      subject: { type: "string", enum: [subjectForStage(stage)] },
      education_stage: { type: "string", enum: [stage] },
      extracted_question: { type: "string" },
      chapter: {
        type: "object", additionalProperties: false,
        properties: { code: { type: "string", enum: chapters.map(([code]) => code) }, name: { type: "string", enum: chapters.map(([, name]) => name) } },
        required: ["code", "name"],
      },
      knowledge_points: {
        type: "array", minItems: 1, maxItems: 4,
        items: {
          type: "object", additionalProperties: false,
          properties: { code: { type: "string", enum: contentTaxonomy.map(([code]) => code) }, name: { type: "string", enum: contentTaxonomy.map(([, name]) => name) } },
          required: ["code", "name"],
        },
      },
      methods: {
        type: "array", maxItems: 2,
        items: {
          type: "object", additionalProperties: false,
          properties: { code: { type: "string", enum: methodTaxonomy.map(([code]) => code) }, name: { type: "string", enum: methodTaxonomy.map(([, name]) => name) } },
          required: ["code", "name"],
        },
      },
      question_type: { type: "string", enum: questionTypes },
      difficulty: { type: "string", enum: ["基础", "中等", "较难"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      needs_review: { type: "boolean" },
      review_reasons: { type: "array", items: { type: "string", enum: reviewReasons } },
      classification_notes: { type: "string" },
    },
    required: ["schema_version", "taxonomy_version", "subject", "education_stage", "extracted_question", "chapter", "knowledge_points", "methods", "question_type", "difficulty", "confidence", "needs_review", "review_reasons", "classification_notes"],
  } as const;
}

export const classificationSchema = classificationSchemaForStage("初中");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function pushIssue(issues: ClassificationValidationIssue[], code: string, field: string, message: string) {
  issues.push({ code, field, message });
}

function allowedChaptersForQuestionType(stage: EducationStage, type: QuestionType) {
  const rules: Partial<Record<QuestionType, string[]>> = stage === "高中"
    ? {
        "函数性质与图像分析": ["HS-FUNCTION", "HS-ELEMENTARY-FUNCTION", "HS-TRIG-FUNCTION", "HS-DERIVATIVE"],
        "概率计算": ["HS-PROBABILITY", "HS-COUNTING-RANDOM"],
        "统计图表分析": ["HS-STATISTICS"],
        "几何计算": ["HS-VECTOR-TRIANGLE", "HS-SOLID-GEOMETRY", "HS-SPACE-VECTOR", "HS-ANALYTIC-GEOMETRY"],
        "几何证明": ["HS-VECTOR-TRIANGLE", "HS-SOLID-GEOMETRY", "HS-SPACE-VECTOR", "HS-ANALYTIC-GEOMETRY"],
      }
    : {
        "函数性质与图像分析": ["FUNC-CONCEPT", "FUNC-LINEAR", "FUNC-INVERSE", "FUNC-QUADRATIC"],
        "概率计算": ["PROBABILITY"],
        "统计图表分析": ["STAT-DATA", "STAT-DESCRIPTIVE"],
        "几何计算": ["COORDINATE", "GEO-BASIC", "GEO-TRIANGLE", "GEO-QUADRILATERAL", "GEO-SIMILARITY", "GEO-CIRCLE", "GEO-TRANSFORM", "GEO-TRIG", "GEO-PROJECTION"],
        "几何证明": ["GEO-BASIC", "GEO-TRIANGLE", "GEO-QUADRILATERAL", "GEO-SIMILARITY", "GEO-CIRCLE", "GEO-TRANSFORM"],
      };
  return rules[type];
}

const noteKnowledgePointRules: Partial<
  Record<EducationStage, Array<{ code: string; pattern: RegExp }>>
> = {
  高中: [
    { code: "HS-FUNC-MONOTONICITY", pattern: /单调性|单调区间/ },
    { code: "HS-FUNC-PARITY", pattern: /奇偶性|奇函数|偶函数/ },
    { code: "HS-FUNC-PERIODICITY", pattern: /周期性|最小正周期/ },
    { code: "HS-FUNC-EXTREMUM", pattern: /函数.{0,4}(最值|极值)|极大值|极小值/ },
    { code: "HS-FUNC-ZERO", pattern: /函数.{0,3}零点/ },
  ],
};

export function knowledgePointCodesMentionedInNotes(
  stage: EducationStage,
  notes: string,
) {
  return (noteKnowledgePointRules[stage] || [])
    .filter((rule) => rule.pattern.test(notes))
    .map((rule) => rule.code);
}

export function synchronizeCandidateWithClassificationNotes(
  stage: EducationStage,
  value: MathClassificationCandidate,
) {
  const candidate = structuredClone(value);
  const owners = new Map<string, string>(
    taxonomyForStage(stage).map(([code, , owner]) => [code, owner]),
  );
  const mentioned = knowledgePointCodesMentionedInNotes(
    stage,
    candidate.classification_notes || "",
  );
  const existing = [
    ...(candidate.core_knowledge_point_codes || []),
    ...(candidate.auxiliary_knowledge_point_codes || []),
    ...(candidate.method_codes || []),
  ];
  const primary = mentioned.find(code => owners.get(code) === candidate.chapter_code)
    || candidate.core_knowledge_point_codes?.[0];
  const selected = [...new Set([primary, ...mentioned, ...existing].filter(Boolean) as string[])];
  const selectedContent = selected.filter(code => owners.get(code) !== "METHOD").slice(0, 4);
  candidate.core_knowledge_point_codes = selectedContent
    .filter(code => owners.get(code) === candidate.chapter_code)
    .slice(0, 3);
  candidate.auxiliary_knowledge_point_codes = selectedContent
    .filter(code => {
      const owner = owners.get(code);
      return owner && owner !== candidate.chapter_code && owner !== "METHOD";
    })
    .slice(0, 2);
  candidate.method_codes = selected.filter(code => owners.get(code) === "METHOD").slice(0, 2);
  const retained = new Set([
    ...candidate.core_knowledge_point_codes,
    ...candidate.auxiliary_knowledge_point_codes,
    ...candidate.method_codes,
  ]);
  if (mentioned.some(code => !retained.has(code))) {
    candidate.classification_notes = "依据题目求解所需的核心内容、相关函数性质与方法确定上述分类。";
  }
  return candidate;
}

/**
 * Correct high-confidence method patterns that vision models often flatten into
 * a generic "function maximum/minimum" label. This only fires when the visible
 * statement contains all structural signals, so ambiguous problems stay with
 * the model result for teacher review.
 */
export function applyDeterministicClassificationHints(
  stage: EducationStage,
  extractedQuestion: string,
  value: MathClassificationCandidate,
) {
  const candidate = structuredClone(value);
  const text = extractedQuestion.replace(/\s+/g, "");
  const asksForExtremum = /(最大值|最小值|最值)/.test(text);
  const reciprocalTermCount = (
    text.match(/(?:\d+(?:\.\d+)?|[a-z])\/(?:\([^)]*[a-z][^)]*\)|[a-z])/gi) || []
  ).length;
  const hasTwoVariableLinearConstraint =
    /[a-z][^=]{0,16}[+\-][^=]{0,16}[a-z][^=]{0,8}=\-?\d/i.test(text);

  if (
    stage === "高中" &&
    asksForExtremum &&
    reciprocalTermCount >= 2 &&
    hasTwoVariableLinearConstraint
  ) {
    candidate.chapter_code = "HS-INEQUALITY";
    candidate.core_knowledge_point_codes = [
      "HS-INEQ-BASIC-OPTIMIZATION",
      "HS-INEQ-BASIC-EQUALITY",
    ];
    candidate.auxiliary_knowledge_point_codes = [];
    candidate.method_codes = ["METHOD-TRANSFORMATION"];
    candidate.question_type = "方案设计与最优化";
    candidate.difficulty = "中等";
    candidate.classification_notes =
      "将线性约束整体变形为两个正数之和为定值，再用基本不等式求最小值并核对等号条件。";
  }
  return candidate;
}

const superscripts: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "n": "ⁿ",
};

const subscripts: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌",
};

function matchingBrace(text: string, open: number) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function readableMathPart(value: string) {
  const normalized = latexBodyToReadable(value).trim();
  return /^[\p{L}\p{N}⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉.+-]+$/u.test(normalized)
    ? normalized
    : `(${normalized})`;
}

function replaceFractions(value: string) {
  let result = value;
  let start = result.indexOf("\\frac");
  while (start >= 0) {
    const numeratorOpen = result.indexOf("{", start + 5);
    if (numeratorOpen < 0) break;
    const numeratorClose = matchingBrace(result, numeratorOpen);
    const denominatorOpen = result.indexOf("{", numeratorClose + 1);
    if (numeratorClose < 0 || denominatorOpen !== numeratorClose + 1) break;
    const denominatorClose = matchingBrace(result, denominatorOpen);
    if (denominatorClose < 0) break;
    const numerator = readableMathPart(result.slice(numeratorOpen + 1, numeratorClose));
    const denominator = readableMathPart(result.slice(denominatorOpen + 1, denominatorClose));
    result = result.slice(0, start) + `${numerator}/${denominator}` + result.slice(denominatorClose + 1);
    start = result.indexOf("\\frac", start + numerator.length + denominator.length + 1);
  }
  return result;
}

function latexBodyToReadable(value: string): string {
  let result = replaceFractions(value);
  result = result
    .replace(/\\(?:overline|bar|vec|mathrm|mathbf|text)\{([^{}]*)\}/g, "$1")
    .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
    .replace(/\^\{([0-9+\-=n]+)\}/g, (_, power: string) => [...power].map(item => superscripts[item] || item).join(""))
    .replace(/\^([0-9])/g, (_, power: string) => superscripts[power] || power)
    .replace(/_\{([0-9+\-=]+)\}/g, (_, subscript: string) => [...subscript].map(item => subscripts[item] || item).join(""))
    .replace(/_([0-9])/g, (_, subscript: string) => subscripts[subscript] || subscript)
    .replace(/\\(?:cdot|times)\b/g, "·")
    .replace(/\\leq?\b/g, "≤").replace(/\\geq?\b/g, "≥").replace(/\\neq\b/g, "≠")
    .replace(/\\perp\b/g, "⊥").replace(/\\parallel\b/g, "∥").replace(/\\angle\b/g, "∠")
    .replace(/\\in\b/g, "∈").replace(/\\pi\b/g, "π")
    .replace(/\\alpha\b/g, "α").replace(/\\beta\b/g, "β").replace(/\\theta\b/g, "θ")
    .replace(/\\left|\\right/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]{2,}/g, " ");
  return result;
}

/** Convert common model-produced LaTeX into readable, editable teacher-facing text. */
export function normalizeExtractedQuestion(value: string) {
  return latexBodyToReadable(value
    .replace(/\\\[|\\\]|\\\(|\\\)|\$\$/g, "")
    .replace(/\$/g, ""))
    .replace(/\s+([，。；：、！？])/g, "$1")
    .trim();
}

/** Internal taxonomy IDs are storage keys and must never leak into teacher-facing notes. */
export function localizeClassificationNotes(stage: EducationStage, value: string) {
  const labels = new Map<string, string>([
    ...chaptersForStage(stage).map(([code, name]) => [code, name] as const),
    ...taxonomyForStage(stage).map(([code, name]) => [code, name] as const),
  ]);
  let result = value;
  for (const [code, name] of [...labels].sort((a, b) => b[0].length - a[0].length)) {
    result = result.replaceAll(code, name);
  }
  return result;
}

export function validateClassificationCandidate(stage: EducationStage, value: unknown): ClassificationValidationIssue[] {
  const issues: ClassificationValidationIssue[] = [];
  if (!isRecord(value)) {
    pushIssue(issues, "INVALID_SHAPE", "$", "分类结果不是 JSON 对象。");
    return issues;
  }

  const candidate = value as Partial<MathClassificationCandidate>;
  const chapters = new Map<string, string>(chaptersForStage(stage).map(([code, name]) => [code, name]));
  const taxonomy = new Map<string, { name: string; chapter: string }>(taxonomyForStage(stage).map(([code, name, chapter]) => [code, { name, chapter }]));
  if (!candidate.chapter_code || !chapters.has(candidate.chapter_code)) {
    pushIssue(issues, "UNKNOWN_CHAPTER", "chapter_code", "主章节 ID 不在当前学段标签库中。");
  }

  const groups: Array<[keyof MathClassificationCandidate, unknown, "core" | "auxiliary" | "method"]> = [
    ["core_knowledge_point_codes", candidate.core_knowledge_point_codes, "core"],
    ["auxiliary_knowledge_point_codes", candidate.auxiliary_knowledge_point_codes, "auxiliary"],
    ["method_codes", candidate.method_codes, "method"],
  ];
  const seen = new Set<string>();
  for (const [field, rawCodes, role] of groups) {
    if (!stringArray(rawCodes)) {
      pushIssue(issues, "INVALID_FIELD", field, `${field} 必须是字符串数组。`);
      continue;
    }
    if (role === "core" && rawCodes.length === 0) pushIssue(issues, "MISSING_CORE_POINT", field, "至少需要一个核心知识点。");
    for (const code of rawCodes) {
      const entry = taxonomy.get(code);
      if (!entry) {
        pushIssue(issues, "UNKNOWN_KNOWLEDGE_POINT", field, `知识点 ${code} 不在当前学段标签库中。`);
        continue;
      }
      if (seen.has(code)) pushIssue(issues, "DUPLICATE_KNOWLEDGE_POINT", field, `知识点 ${code} 被重复分配。`);
      seen.add(code);
      if (role === "method" && entry.chapter !== "METHOD") pushIssue(issues, "CONTENT_AS_METHOD", field, `${code} 是考查内容，不能放入解题方法。`);
      if (role !== "method" && entry.chapter === "METHOD") pushIssue(issues, "METHOD_AS_CONTENT", field, `${code} 是通用方法，不能作为核心或辅助知识点。`);
      if (role === "core" && candidate.chapter_code && entry.chapter !== candidate.chapter_code) {
        pushIssue(issues, "CORE_POINT_CHAPTER_MISMATCH", field, `核心知识点 ${code} 不属于主章节 ${candidate.chapter_code}。`);
      }
      if (role === "auxiliary" && candidate.chapter_code && entry.chapter === candidate.chapter_code) {
        pushIssue(issues, "AUXILIARY_POINT_IN_PRIMARY_CHAPTER", field, `同主章节知识点 ${code} 应作为核心知识点，而不是跨章节辅助知识点。`);
      }
    }
  }

  const notesMentionedCodes = knowledgePointCodesMentionedInNotes(
    stage,
    candidate.classification_notes || "",
  );
  for (const code of notesMentionedCodes) {
    if (!seen.has(code))
      pushIssue(
        issues,
        "NOTES_KNOWLEDGE_POINT_MISMATCH",
        "classification_notes",
        `分类依据提到了 ${taxonomy.get(code)?.name || code}，但知识点数组未包含该标签。`,
      );
  }

  const contentCount = (candidate.core_knowledge_point_codes?.length || 0) + (candidate.auxiliary_knowledge_point_codes?.length || 0);
  if (contentCount > 4) pushIssue(issues, "TOO_MANY_KNOWLEDGE_POINTS", "knowledge_points", "核心与辅助知识点合计不能超过 4 个。");
  if ((candidate.method_codes?.length || 0) > 2) pushIssue(issues, "TOO_MANY_METHODS", "method_codes", "数学思想与方法不能超过 2 个。");
  if (!candidate.question_type || !(questionTypes as readonly string[]).includes(candidate.question_type)) {
    pushIssue(issues, "INVALID_QUESTION_TYPE", "question_type", "题型不在受控列表中。");
  } else if (candidate.chapter_code) {
    const allowed = allowedChaptersForQuestionType(stage, candidate.question_type);
    if (allowed && !allowed.includes(candidate.chapter_code)) {
      pushIssue(issues, "QUESTION_TYPE_CHAPTER_CONFLICT", "question_type", `题型“${candidate.question_type}”与主章节 ${candidate.chapter_code} 明显不一致。`);
    }
  }
  if (!candidate.difficulty || !(["基础", "中等", "较难"] as const).includes(candidate.difficulty)) {
    pushIssue(issues, "INVALID_DIFFICULTY", "difficulty", "难度不在受控列表中。");
  }
  if (typeof candidate.confidence !== "number" || candidate.confidence < 0 || candidate.confidence > 1) {
    pushIssue(issues, "INVALID_CONFIDENCE", "confidence", "置信度必须是 0 到 1 之间的数字。");
  }
  if (!stringArray(candidate.review_reasons) || candidate.review_reasons.some(reason => !(reviewReasons as readonly string[]).includes(reason))) {
    pushIssue(issues, "INVALID_REVIEW_REASON", "review_reasons", "复核原因包含非规范代码。");
  }
  if ((typeof candidate.confidence === "number" && candidate.confidence < 0.8) || (Array.isArray(candidate.review_reasons) && candidate.review_reasons.length > 0)) {
    if (candidate.needs_review !== true) pushIssue(issues, "REVIEW_STATE_CONFLICT", "needs_review", "低置信度或存在复核原因时必须标记需要核对。");
  }
  if (candidate.needs_followup === true && candidate.needs_review !== true) {
    pushIssue(issues, "DEEP_ANALYSIS_REVIEW_CONFLICT", "needs_review", "仍需要深入分析时必须保留人工核对标记。");
  }
  for (const field of ["classification_notes"] as const) {
    if (typeof candidate[field] !== "string" || !candidate[field]?.trim()) pushIssue(issues, "INVALID_FIELD", field, `${field} 不能为空。`);
  }
  if (typeof candidate.needs_followup !== "boolean") pushIssue(issues, "INVALID_FIELD", "needs_followup", "needs_followup 必须是布尔值。");
  if (typeof candidate.needs_review !== "boolean") pushIssue(issues, "INVALID_FIELD", "needs_review", "needs_review 必须是布尔值。");
  return issues;
}

export function buildClassificationFromCandidate(
  stage: EducationStage,
  extraction: VisionExtraction,
  candidate: MathClassificationCandidate,
): Classification {
  const chapter = chaptersForStage(stage).find(([code]) => code === candidate.chapter_code)!;
  const taxonomy = new Map<string, string>(taxonomyForStage(stage).map(([code, name]) => [code, name]));
  const orderedCodes = [
    ...candidate.core_knowledge_point_codes,
    ...candidate.auxiliary_knowledge_point_codes,
  ];
  const reasons = [...new Set([...extraction.review_reasons, ...candidate.review_reasons])];
  const confidence = Math.min(extraction.extraction_confidence, candidate.confidence);
  return {
    schema_version: "1.0",
    taxonomy_version: taxonomyVersionForStage(stage),
    subject: subjectForStage(stage),
    education_stage: stage,
    extracted_question: normalizeExtractedQuestion(extraction.extracted_question),
    chapter: { code: chapter[0], name: chapter[1] },
    knowledge_points: orderedCodes.map(code => ({ code, name: taxonomy.get(code)! })),
    methods: candidate.method_codes.map(code => ({ code, name: taxonomy.get(code)! })),
    question_type: candidate.question_type,
    difficulty: candidate.difficulty,
    confidence,
    needs_review: extraction.needs_review || candidate.needs_review || confidence < 0.8 || reasons.length > 0,
    review_reasons: reasons,
    classification_notes: localizeClassificationNotes(stage, candidate.classification_notes),
  };
}

/**
 * Upgrade historical mixed classifications in memory. Older records stored
 * method labels inside knowledge_points; callers can safely use this before
 * rendering or persisting a teacher edit.
 */
export function normalizeClassificationTags(value: Classification): Classification {
  const stage = value.education_stage;
  const taxonomy = new Map<string, { name: string; owner: string }>(taxonomyForStage(stage).map(([code, name, owner]) => [code, { name, owner }]));
  const content = new Map<string, KnowledgePoint>();
  const methods = new Map<string, KnowledgePoint>();
  for (const point of [...(value.knowledge_points || []), ...(value.methods || [])]) {
    const entry = taxonomy.get(point.code);
    if (!entry) continue;
    const canonical = { code: point.code, name: entry.name };
    if (entry.owner === "METHOD") methods.set(point.code, canonical);
    else content.set(point.code, canonical);
  }
  return { ...value, knowledge_points: [...content.values()].slice(0, 4), methods: [...methods.values()].slice(0, 2) };
}

export function validateClassification(value: unknown): ClassificationValidationIssue[] {
  const issues: ClassificationValidationIssue[] = [];
  if (!isRecord(value)) {
    pushIssue(issues, "INVALID_SHAPE", "$", "分类数据不是对象。");
    return issues;
  }
  const rawItem = value as Partial<Classification>;
  const item = rawItem.education_stage === "初中" || rawItem.education_stage === "高中"
    ? normalizeClassificationTags(rawItem as Classification)
    : rawItem;
  const stage = item.education_stage;
  if (stage !== "初中" && stage !== "高中") {
    pushIssue(issues, "INVALID_STAGE", "education_stage", "学段无效。");
    return issues;
  }
  if (item.schema_version !== "1.0" || item.subject !== subjectForStage(stage) || item.taxonomy_version !== taxonomyVersionForStage(stage)) {
    pushIssue(issues, "STAGE_METADATA_CONFLICT", "education_stage", "学段、科目或标签库版本不一致。");
  }
  const chapter = chaptersForStage(stage).find(([code]) => code === item.chapter?.code);
  if (!chapter || item.chapter?.name !== chapter[1]) pushIssue(issues, "INVALID_CHAPTER", "chapter", "章节 ID 与规范名称不匹配。");
  const taxonomy = new Map<string, { name: string; owner: string }>(taxonomyForStage(stage).map(([code, name, owner]) => [code, { name, owner }]));
  if (!Array.isArray(item.knowledge_points) || item.knowledge_points.length < 1 || item.knowledge_points.length > 4) {
    pushIssue(issues, "INVALID_KNOWLEDGE_POINT_COUNT", "knowledge_points", "知识点数量必须为 1–4 个。");
  } else {
    const seen = new Set<string>();
    let primaryContentCount = 0;
    for (const point of item.knowledge_points) {
      const entry = point && taxonomy.get(point.code);
      if (!entry || entry.name !== point.name) pushIssue(issues, "INVALID_KNOWLEDGE_POINT", "knowledge_points", `知识点 ${point?.code || "(空)"} 的 ID 或名称无效。`);
      if (entry?.owner === "METHOD") pushIssue(issues, "METHOD_AS_CONTENT", "knowledge_points", `${point.code} 是数学思想或方法，不能作为知识点统计。`);
      if (seen.has(point.code)) pushIssue(issues, "DUPLICATE_KNOWLEDGE_POINT", "knowledge_points", `知识点 ${point.code} 重复。`);
      seen.add(point.code);
      if (entry?.owner === item.chapter?.code) primaryContentCount += 1;
    }
    if (primaryContentCount === 0) pushIssue(issues, "CHAPTER_WITHOUT_CORE_POINT", "knowledge_points", "至少一个内容知识点必须属于主章节，不能只保留跨章节或方法标签。");
  }
  if (!Array.isArray(item.methods) || item.methods.length > 2) {
    pushIssue(issues, "INVALID_METHOD_COUNT", "methods", "数学思想与方法必须为数组，且最多 2 个。");
  } else {
    const seenMethods = new Set<string>();
    for (const method of item.methods) {
      const entry = method && taxonomy.get(method.code);
      if (!entry || entry.name !== method.name || entry.owner !== "METHOD") pushIssue(issues, "INVALID_METHOD", "methods", `方法 ${method?.code || "(空)"} 的 ID 或名称无效。`);
      if (seenMethods.has(method.code)) pushIssue(issues, "DUPLICATE_METHOD", "methods", `方法 ${method.code} 重复。`);
      seenMethods.add(method.code);
    }
  }
  if (!item.question_type || !(questionTypes as readonly string[]).includes(item.question_type)) {
    pushIssue(issues, "INVALID_QUESTION_TYPE", "question_type", "题型无效。");
  } else if (item.chapter?.code) {
    const allowed = allowedChaptersForQuestionType(stage, item.question_type as QuestionType);
    if (allowed && !allowed.includes(item.chapter.code)) {
      pushIssue(issues, "QUESTION_TYPE_CHAPTER_CONFLICT", "question_type", "题型与主章节明显不一致。");
    }
  }
  if (!item.difficulty || !(["基础", "中等", "较难"] as const).includes(item.difficulty)) pushIssue(issues, "INVALID_DIFFICULTY", "difficulty", "难度无效。");
  if (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) pushIssue(issues, "INVALID_CONFIDENCE", "confidence", "置信度无效。");
  if (typeof item.extracted_question !== "string" || !item.extracted_question.trim()) pushIssue(issues, "EMPTY_QUESTION", "extracted_question", "题目原文不能为空。");
  if (typeof item.classification_notes !== "string") pushIssue(issues, "INVALID_NOTES", "classification_notes", "分类依据必须是字符串。");
  if (typeof item.needs_review !== "boolean" || !Array.isArray(item.review_reasons)) pushIssue(issues, "INVALID_REVIEW_STATE", "needs_review", "复核状态无效。");
  return issues;
}

export function isClassification(value: unknown): value is Classification {
  return validateClassification(value).length === 0;
}

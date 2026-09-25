export type Difficulty = "基础" | "中等" | "较难";
export type KnowledgePoint = { code: string; name: string };

export type Classification = {
  schema_version: "1.0";
  taxonomy_version: "cn-junior-math-1.0";
  subject: "初中数学";
  education_stage: "初中";
  extracted_question: string;
  chapter: { code: string; name: string };
  knowledge_points: KnowledgePoint[];
  question_type: string;
  difficulty: Difficulty;
  confidence: number;
  needs_review: boolean;
  review_reasons: string[];
  classification_notes: string;
};

export const questionTypes = [
  "概念辨析", "直接计算", "化简与求值", "解方程或不等式", "证明题", "作图题",
  "读图与信息提取", "已知条件求解析式", "函数性质与图像分析", "几何计算", "几何证明",
  "统计图表分析", "概率计算", "规律探究", "方案设计与最优化", "实际应用建模", "综合题", "其他",
] as const;

export const reviewReasons = [
  "IMAGE_UNCLEAR", "CONTENT_CROPPED", "DIAGRAM_REQUIRED", "OCR_AMBIGUOUS",
  "CLASSIFICATION_AMBIGUOUS", "NO_TAXONOMY_MATCH", "OUT_OF_SCOPE_TAXONOMY",
  "POSSIBLE_DUPLICATE", "OTHER",
] as const;

export const classificationSchema = {
  type: "object", additionalProperties: false,
  properties: {
    schema_version: { type: "string", enum: ["1.0"] },
    taxonomy_version: { type: "string", enum: ["cn-junior-math-1.0"] },
    subject: { type: "string", enum: ["初中数学"] },
    education_stage: { type: "string", enum: ["初中"] },
    extracted_question: { type: "string" },
    chapter: { type: "object", additionalProperties: false, properties: { code: { type: "string" }, name: { type: "string" } }, required: ["code", "name"] },
    knowledge_points: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false, properties: { code: { type: "string" }, name: { type: "string" } }, required: ["code", "name"] } },
    question_type: { type: "string", enum: questionTypes },
    difficulty: { type: "string", enum: ["基础", "中等", "较难"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_review: { type: "boolean" },
    review_reasons: { type: "array", items: { type: "string", enum: reviewReasons } },
    classification_notes: { type: "string" },
  },
  required: ["schema_version", "taxonomy_version", "subject", "education_stage", "extracted_question", "chapter", "knowledge_points", "question_type", "difficulty", "confidence", "needs_review", "review_reasons", "classification_notes"],
} as const;

export function isClassification(value: unknown): value is Classification {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Classification>;
  return Boolean(item.schema_version === "1.0" && item.taxonomy_version === "cn-junior-math-1.0" && item.chapter?.code && item.chapter?.name && Array.isArray(item.knowledge_points) && item.knowledge_points.length && item.extracted_question && item.question_type && item.difficulty);
}

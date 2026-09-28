type ClassifiableQuestion = {
  chapterCode: string;
  chapterName?: string;
  knowledgePoints?: { code: string }[];
};

export const questionCategoryOrder = [
  "集合与逻辑",
  "函数与导数",
  "三角函数与解三角形",
  "数列",
  "不等式",
  "平面向量",
  "立体几何与空间向量",
  "平面解析几何",
  "计数原理与概率统计",
  "复数",
] as const;

export type QuestionCategory = typeof questionCategoryOrder[number];

export function broadQuestionCategory(question: ClassifiableQuestion): QuestionCategory | "其他" {
  const code = question.chapterCode;
  const pointCodes = question.knowledgePoints?.map(point => point.code) || [];

  if (code === "HS-SETS-LOGIC") return "集合与逻辑";
  if (["HS-FUNCTION", "HS-ELEMENTARY-FUNCTION", "HS-DERIVATIVE"].includes(code)) return "函数与导数";
  if (code === "HS-TRIG-FUNCTION") return "三角函数与解三角形";
  if (code === "HS-VECTOR-TRIANGLE") {
    return pointCodes.some(pointCode => pointCode.startsWith("HS-VECTOR-")) ? "平面向量" : "三角函数与解三角形";
  }
  if (code === "HS-SEQUENCE") return "数列";
  if (code === "HS-INEQUALITY") return "不等式";
  if (code === "HS-SOLID-GEOMETRY" || code === "HS-SPACE-VECTOR") return "立体几何与空间向量";
  if (code === "HS-ANALYTIC-GEOMETRY") return "平面解析几何";
  if (["HS-PROBABILITY", "HS-STATISTICS", "HS-COUNTING-RANDOM"].includes(code)) return "计数原理与概率统计";
  if (code === "HS-COMPLEX") return "复数";
  return "其他";
}

export function questionChapterLabel(question: ClassifiableQuestion) {
  if (question.chapterCode !== "HS-VECTOR-TRIANGLE") return question.chapterName || question.chapterCode;
  return broadQuestionCategory(question) === "平面向量" ? "平面向量" : "解三角形";
}

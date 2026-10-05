import { z } from "zod";

export const diagnosticItemSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  purpose: z.string().trim().min(1).max(500),
  expected_answer: z.string().trim().min(1).max(1000),
  error_signal: z.string().trim().min(1).max(500),
  follow_up_if_correct: z.string().trim().min(1).max(500),
  follow_up_if_wrong: z.string().trim().min(1).max(500),
}).strict();

export const diagnosticPackageSchema = z.object({
  status: z.enum(["ready", "insufficient_context"]),
  diagnostic_goal: z.string().trim().min(1).max(500),
  questions: z.array(diagnosticItemSchema).length(2),
  teacher_note: z.string().trim().min(1).max(1000),
}).strict();

export type DiagnosticPackage = z.infer<typeof diagnosticPackageSchema>;
export type DiagnosticItem = z.infer<typeof diagnosticItemSchema> & { id: string; position: number };
export function materializeDiagnosticItems(planId: string, value: DiagnosticPackage) {
  return value.questions.map((item, index) => ({
    id: `${planId}:${index + 1}`, planId, position: index + 1, content: JSON.stringify(item),
  }));
}

export type DiagnosticGenerationContext = {
  educationStage: string;
  chapterName: string;
  knowledgePointName: string;
  originalQuestion: string;
  studentResponse: string;
  correctness: string;
  supportLevel: string;
  evidenceLevel: string;
  evidenceSource: string;
  candidateErrors: string[];
  ruleQuestions: readonly string[];
};

export type DiagnosticProviderConfig = {
  apiKey?: string;
  baseUrl: string;
  apiStyle: string;
  model: string;
  strictJsonSchema: boolean;
};

export const diagnosticJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["ready", "insufficient_context"] },
    diagnostic_goal: { type: "string" },
    questions: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          purpose: { type: "string" },
          expected_answer: { type: "string" },
          error_signal: { type: "string" },
          follow_up_if_correct: { type: "string" },
          follow_up_if_wrong: { type: "string" },
        },
        required: ["question", "purpose", "expected_answer", "error_signal", "follow_up_if_correct", "follow_up_if_wrong"],
      },
    },
    teacher_note: { type: "string" },
  },
  required: ["status", "diagnostic_goal", "questions", "teacher_note"],
} as const;

function outputText(payload: unknown) {
  const data = payload as {
    output_text?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof data.output_text === "string") return data.output_text;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.map((item) => item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text : "").join("");
  for (const item of data.output ?? [])
    for (const part of item.content ?? [])
      if (part.type === "output_text" && part.text) return part.text;
  return "";
}

export function fallbackDiagnosticPackage(context: DiagnosticGenerationContext): DiagnosticPackage {
  const questions = [...context.ruleQuestions].slice(0, 2);
  while (questions.length < 2) questions.push("请独立完成一道只改变数据的同结构题，并保留完整步骤。");
  return {
    status: "insufficient_context",
    diagnostic_goal: `区分“${context.knowledgePointName}”中的概念、方法选择与计算问题。`,
    questions: questions.map((question, index) => ({
      question,
      purpose: index === 0 ? "先检查基础概念或公式能否独立调用。" : "再检查能否迁移到轻微变化的情境。",
      expected_answer: "由教师依据题目完整过程核对；当前为规则回退，未生成具体答案。",
      error_signal: "若学生仍需提示或在相同关键步骤出错，应继续保留为待验证证据。",
      follow_up_if_correct: "继续下一题，观察是否能在变化情境中独立完成。",
      follow_up_if_wrong: "记录原始步骤，不立即告知答案，再由教师选择针对性提示。",
    })),
    teacher_note: "当前未调用生成模型，以下为规则版诊断。请教师先核对题目与预期答案再使用。",
  };
}

export function buildDiagnosticPrompt(context: DiagnosticGenerationContext) {
  return [
    `学段：${context.educationStage}`,
    `章节：${context.chapterName}`,
    `知识点：${context.knowledgePointName}`,
    `原题：${context.originalQuestion}`,
    `学生已观察到的作答：${context.studentResponse || "未记录完整过程"}`,
    `正确性：${context.correctness}；完成支持：${context.supportLevel}`,
    `证据：${context.evidenceSource} / ${context.evidenceLevel}`,
    `候选错因（仅为待验证假设）：${context.candidateErrors.join("、") || "无"}`,
    "请生成恰好两道由易到难、可独立作答的最小诊断题。两题应尽量区分候选错因，不得把候选错因写成已确认事实。",
    "题目必须条件完整、无需缺失图形，并给出可供教师核验的预期答案。不要复述学生身份信息，不要输出掌握率。",
  ].join("\n");
}

export async function generateDiagnosticPackage(
  context: DiagnosticGenerationContext,
  config: DiagnosticProviderConfig,
  fetcher: typeof fetch = fetch,
): Promise<{ package: DiagnosticPackage; mode: "live" | "fallback" }> {
  if (!config.apiKey) return { package: fallbackDiagnosticPackage(context), mode: "fallback" };
  const instructions = "你是中学数学教师的诊断题设计助手。只依据可观察证据设计最小诊断，不替教师确认错因。只返回符合 JSON Schema 的对象。";
  const format = config.apiStyle === "chat_completions"
    ? config.strictJsonSchema
      ? { type: "json_schema", json_schema: { name: "math_diagnostic_package", strict: true, schema: diagnosticJsonSchema } }
      : { type: "json_object" }
    : { type: "json_schema", name: "math_diagnostic_package", strict: true, schema: diagnosticJsonSchema };
  const schemaInstruction = config.strictJsonSchema
    ? instructions
    : `${instructions}\n必须输出 JSON，并严格符合：${JSON.stringify(diagnosticJsonSchema)}`;
  const prompt = buildDiagnosticPrompt(context);
  const body = config.apiStyle === "chat_completions"
    ? { model: config.model, messages: [{ role: "system", content: schemaInstruction }, { role: "user", content: prompt }], response_format: format }
    : { model: config.model, instructions: schemaInstruction, input: prompt, text: { format }, reasoning: { effort: "low" }, store: false };
  const endpoint = config.baseUrl.trim().replace(/\/+$/, "") + "/" + (config.apiStyle === "chat_completions" ? "chat/completions" : "responses");
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`诊断题生成服务暂时不可用（${response.status}）。`);
  const text = outputText(await response.json()).trim();
  if (!text) throw new Error("诊断题生成服务没有返回内容。");
  return { package: diagnosticPackageSchema.parse(JSON.parse(text)), mode: "live" };
}

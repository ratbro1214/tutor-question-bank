import { env } from "cloudflare:workers";
import {
  applyDeterministicClassificationHints,
  buildClassificationFromCandidate,
  classificationCandidateSchemaForStage,
  questionTypes,
  reviewReasons,
  subjectForStage,
  synchronizeCandidateWithClassificationNotes,
  taxonomyVersionForStage,
  validateClassificationCandidate,
  visionExtractionSchema,
  type Classification,
  type ClassificationAnalysisTrace,
  type ClassificationValidationIssue,
  type EducationStage,
  type MathClassificationCandidate,
  type VisionExtraction,
} from "@/lib/classification";
import { taxonomyForStage, taxonomyHierarchyPromptForStage } from "@/lib/taxonomy";
import { registerAnalysis, unregisterAnalysis } from "@/lib/analysis-cancellation";
import { AnalysisUpstreamError, classifyAnalysisFailure, isRetryableUpstreamStatus, providerReferenceFromText } from "@/lib/analysis-errors";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_UPSTREAM_ATTEMPTS = 2;
const UPSTREAM_ATTEMPT_TIMEOUT_MS = 120_000;
const PROMPT_VERSION = "fast-math-v8-content-method-separated";
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const memoryCache = new Map<string, { expires: number; classification: Classification }>();

type ReasoningEffort = "low" | "medium";
type TokenUsage = ClassificationAnalysisTrace["usage"];
type ModelResult = { value: unknown; timings: Record<string, number>; usage: TokenUsage };
type ProviderConfig = {
  name: "openai" | "deepseek";
  apiKey?: string;
  baseUrl: string;
  apiStyle: string;
  visionModel: string;
  classificationModel: string;
  strictJsonSchema: boolean;
};
type StreamEvent =
  | { type: "status"; state: "uploaded" | "preprocessing" | "cache_check" | "recognizing" | "validating" | "reviewing"; message: string }
  | { type: "complete"; classification: Classification; mode: "live" | "demo"; metrics: Record<string, number>; cacheHit: boolean }
  | { type: "error"; error: string; analysisId: string; retryable: boolean; clientRequestIdSent: true; providerRequestId?: string; providerReferenceId?: string };

const emptyUsage = (): TokenUsage => ({ input_tokens: 0, output_tokens: 0, total_tokens: 0, cached_tokens: 0, reasoning_tokens: 0 });
const elapsed = (start: number) => Math.round((performance.now() - start) * 10) / 10;

function addUsage(target: TokenUsage, value: TokenUsage) {
  for (const key of Object.keys(target) as Array<keyof TokenUsage>) target[key] += value[key];
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readUsage(payload: unknown): TokenUsage {
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const usage = data.usage && typeof data.usage === "object" ? data.usage as Record<string, unknown> : {};
  const inputDetails = (usage.prompt_tokens_details || usage.input_tokens_details) as Record<string, unknown> | undefined;
  const outputDetails = (usage.completion_tokens_details || usage.output_tokens_details) as Record<string, unknown> | undefined;
  return {
    input_tokens: numberValue(usage.prompt_tokens ?? usage.input_tokens),
    output_tokens: numberValue(usage.completion_tokens ?? usage.output_tokens),
    total_tokens: numberValue(usage.total_tokens),
    cached_tokens: numberValue(inputDetails?.cached_tokens),
    reasoning_tokens: numberValue(outputDetails?.reasoning_tokens),
  };
}

function retryDelay(response: Response | undefined, attempt: number) {
  const seconds = Number(response?.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 3_000) : 400 * 2 ** (attempt - 1);
}

async function fetchWithRetry(url: string, init: RequestInit, label: string) {
  let lastResponse: Response | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_UPSTREAM_ATTEMPTS; attempt += 1) {
    try {
      const signal = init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(UPSTREAM_ATTEMPT_TIMEOUT_MS)])
        : AbortSignal.timeout(UPSTREAM_ATTEMPT_TIMEOUT_MS);
      const response = await fetch(url, { ...init, signal });
      lastResponse = response;
      if (response.ok || !isRetryableUpstreamStatus(response.status) || attempt === MAX_UPSTREAM_ATTEMPTS) return response;
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, retryDelay(response, attempt)));
    } catch (error) {
      lastError = error;
      if (init.signal?.aborted || (error instanceof Error && error.name === "TimeoutError") || attempt === MAX_UPSTREAM_ATTEMPTS) throw error;
      await new Promise(resolve => setTimeout(resolve, retryDelay(undefined, attempt)));
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error(label + "请求失败。");
}

function demoClassification(stage: EducationStage): Classification {
  const senior = stage === "高中";
  return {
    schema_version: "1.0", taxonomy_version: taxonomyVersionForStage(stage), subject: subjectForStage(stage), education_stage: stage,
    extracted_question: "演示模式：已收到图片，配置视觉模型密钥后将自动识别题目原文。",
    chapter: senior ? { code: "HS-FUNCTION", name: "函数概念与性质" } : { code: "FUNC-LINEAR", name: "一次函数" },
    knowledge_points: senior ? [{ code: "HS-FUNC-CONCEPT", name: "函数的概念与表示" }] : [{ code: "FUNC-LINEAR-EXPR", name: "一次函数解析式" }],
    methods: [],
    question_type: "已知条件求解析式", difficulty: "基础", confidence: 0.35, needs_review: true,
    review_reasons: ["OTHER"], classification_notes: "当前未配置模型密钥，请教师人工录入并核对。",
  };
}

type ModelPayload = {
  output_text?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function outputText(payload: unknown) {
  const data = payload as ModelPayload;
  if (typeof data.output_text === "string") return data.output_text;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(item => item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text : "").join("");
  for (const item of data.output ?? []) for (const part of item.content ?? []) if (part.type === "output_text" && part.text) return part.text;
  return "";
}

function apiEndpoint(baseUrl?: string, style?: string) {
  return (baseUrl || "https://api.openai.com/v1").trim().replace(/\/+$/, "") + "/" + (style === "chat_completions" ? "chat/completions" : "responses");
}

function providerConfig(): ProviderConfig {
  if (env.AI_PROVIDER === "deepseek") {
    return {
      name: "deepseek",
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      apiStyle: "chat_completions",
      visionModel: env.DEEPSEEK_VISION_MODEL || "deepseek-flash",
      classificationModel: env.DEEPSEEK_CLASSIFICATION_MODEL || "deepseek-v4-pro",
      strictJsonSchema: false,
    };
  }
  const visionModel = env.OPENAI_VISION_MODEL || env.OPENAI_CLASSIFICATION_MODEL || "gpt-4o-mini";
  return {
    name: "openai",
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiStyle: env.OPENAI_API_STYLE || "responses",
    visionModel,
    classificationModel: env.OPENAI_CLASSIFICATION_MODEL || visionModel,
    strictJsonSchema: true,
  };
}

function chatSchema(name: string, schema: object) {
  return { type: "json_schema", json_schema: { name, strict: true, schema } };
}

function responsesSchema(name: string, schema: object) {
  return { type: "json_schema", name, strict: true, schema };
}

function structuredOutputFormat(config: ProviderConfig, name: string, schema: object) {
  if (config.apiStyle === "chat_completions") {
    return config.strictJsonSchema ? chatSchema(name, schema) : { type: "json_object" };
  }
  return responsesSchema(name, schema);
}

function instructionsWithSchema(instructions: string, schema: object, config: ProviderConfig) {
  if (config.strictJsonSchema) return instructions;
  return `${instructions}\n必须只输出一个 JSON 对象，并严格符合以下 JSON Schema（不得添加 Markdown 代码块）：\n${JSON.stringify(schema)}`;
}

async function requestStructuredJson(body: object, config: ProviderConfig, label: string, signal: AbortSignal, cacheKey: string, analysisId: string): Promise<ModelResult> {
  const requestStart = performance.now();
  const response = await fetchWithRetry(apiEndpoint(config.baseUrl, config.apiStyle), {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + config.apiKey,
      "Content-Type": "application/json",
      "X-Client-Request-Id": analysisId,
      ...(config.name === "openai" && config.apiStyle === "chat_completions" ? { "x-grok-conv-id": cacheKey } : {}),
    },
    body: JSON.stringify(body),
    signal,
  }, label);
  const firstResponseMs = elapsed(requestStart);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new AnalysisUpstreamError(response.status, response.headers, providerReferenceFromText(errorBody));
  }
  const payload = await response.json();
  const completeMs = elapsed(requestStart);
  const parseStart = performance.now();
  const text = outputText(payload).trim();
  if (!text) throw new Error(label + "未返回内容。");
  const value = JSON.parse(text) as unknown;
  return { value, usage: readUsage(payload), timings: { first_response: firstResponseMs, complete: completeMs, json_parse: elapsed(parseStart) } };
}

function isVisionExtraction(value: unknown): value is VisionExtraction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<VisionExtraction>;
  return Boolean(typeof item.extracted_question === "string" && item.extracted_question.trim()
    && typeof item.presentation_form === "string" && typeof item.has_diagram === "boolean"
    && typeof item.extraction_confidence === "number" && item.extraction_confidence >= 0 && item.extraction_confidence <= 1
    && typeof item.needs_review === "boolean" && Array.isArray(item.review_reasons)
    && item.review_reasons.every(reason => (reviewReasons as readonly string[]).includes(reason))
    && typeof item.extraction_notes === "string");
}

function fastAnalysisSchema(stage: EducationStage) {
  return {
    type: "object", additionalProperties: false,
    properties: { extraction: visionExtractionSchema(), classification: classificationCandidateSchemaForStage(stage) },
    required: ["extraction", "classification"],
  } as const;
}

function fixedInstructions(stage: EducationStage) {
  return [
    `你是家教题库的${stage}数学图片识别与分类器。忠实抄录题干、公式、选项、单位、图中标签及小问；忽略手写草稿。`,
    "extracted_question 面向教师直接阅读和编辑：保持原题的编号、换行与选项结构；公式使用可读的 Unicode/纯文本写法（例如 x²/4 + y²/2 = 1、PA:PN = PB·PM），禁止输出 \\frac、\\overline、^{}、_{}、美元符号等 LaTeX 源码。不要改写或概括原题。",
    "看不清处写[无法辨认]，不得猜测；图片、裁切、图形或分类存在不确定性时设置复核原因。",
    "严格区分考查内容与数学思想方法：知识点回答‘考了什么’，数学思想与方法回答‘怎么组织或求解’。转化与化归、数学建模、数形结合、分类讨论、函数与方程思想、整体思想，以及换元、配方、待定系数、消元、反证、归纳、裂项相消、错位相减等只能放 method_codes，绝不能放 core 或 auxiliary，也不参与知识点统计。",
    "按解题所必需的数学内容选择唯一主章节及最少知识点：优先选择能准确描述实际考法的最细内容知识点（例如切线方程、二面角、椭圆离心率、数列求和），不要在已有细分标签时只选宽泛上位标签；主章节内容放 core，跨章节必要内容放 auxiliary，数学思想或解题方法放 method_codes。内容知识点合计不超过4个，方法最多2个。",
    "不要因为题目出现“最大值/最小值”就默认归入函数：若分式目标可借助线性约束整体代换为正数定和，再用基本不等式或柯西不等式求界，主章节必须选“等式与不等式”，核心知识点选“利用基本不等式求最值”，整体代换放入方法标签。",
    "题型表示数学任务，不表示选择/填空等版式。难度按推理要求判断。classification_notes 只写一句可核验的中文分类依据，不输出答案、完整解题过程或 HS-ANALYTIC-ELLIPSE 这类内部标签 ID；依据中提到的受控知识点必须同时出现在 core 或 auxiliary 数组中。",
    "仅在提取不完整、标签不存在或章节仍冲突时设置 needs_followup=true；规则通过也不代表无需教师确认。",
    taxonomyHierarchyPromptForStage(stage),
    "题型：" + questionTypes.join("、") + "。只返回符合 JSON Schema 的对象。",
  ].join("\n");
}

function withReasoning(body: Record<string, unknown>, apiStyle: string, effort: ReasoningEffort, cacheKey: string) {
  return apiStyle === "chat_completions"
    ? { ...body, reasoning_effort: effort }
    : { ...body, reasoning: { effort }, prompt_cache_key: cacheKey };
}

async function runFastAnalysis(dataUrl: string, stage: EducationStage, config: ProviderConfig, effort: ReasoningEffort, signal: AbortSignal, cacheKey: string, analysisId: string) {
  const schema = fastAnalysisSchema(stage);
  const instructions = instructionsWithSchema(fixedInstructions(stage), schema, config);
  const body = config.apiStyle === "chat_completions"
    ? { model: config.visionModel, messages: [
        { role: "system", content: instructions },
        { role: "user", content: [{ type: "text", text: `识别并分类这张${stage}数学题。` }, { type: "image_url", image_url: { url: dataUrl, detail: "high" } }] },
      ], response_format: structuredOutputFormat(config, "fast_math_analysis", schema) }
    : { model: config.visionModel, instructions, input: [{ role: "user", content: [{ type: "input_text", text: `识别并分类这张${stage}数学题。` }, { type: "input_image", image_url: dataUrl, detail: "high" }] }], text: { format: structuredOutputFormat(config, "fast_math_analysis", schema) }, store: false };
  return requestStructuredJson(withReasoning(body, config.apiStyle, effort, cacheKey), config, "快速识别", signal, cacheKey, analysisId);
}

function validationRetryReason(issues: ClassificationValidationIssue[]) {
  return issues.map(issue => `[${issue.code}] ${issue.message}`).join("\n");
}

function normalizeCandidate(stage: EducationStage, value: MathClassificationCandidate) {
  const candidate = structuredClone(value);
  const owners = new Map<string, string>(taxonomyForStage(stage).map(([code, , owner]) => [code, owner]));
  const core = new Set(candidate.core_knowledge_point_codes || []);
  const auxiliary = new Set(candidate.auxiliary_knowledge_point_codes || []);
  const methods = new Set(candidate.method_codes || []);
  for (const code of [...core]) {
    const owner = owners.get(code);
    if (owner === "METHOD") { core.delete(code); methods.add(code); }
    else if (owner && owner !== candidate.chapter_code) { core.delete(code); auxiliary.add(code); }
  }
  for (const code of [...auxiliary]) {
    const owner = owners.get(code);
    if (owner === "METHOD") { auxiliary.delete(code); methods.add(code); }
    else if (owner === candidate.chapter_code) { auxiliary.delete(code); core.add(code); }
  }
  for (const code of [...methods]) if (owners.get(code) !== "METHOD") methods.delete(code);
  const orderedContent = [...core, ...auxiliary].filter(code => owners.get(code) !== "METHOD").slice(0, 4);
  candidate.core_knowledge_point_codes = orderedContent.filter(code => owners.get(code) === candidate.chapter_code).slice(0, 3);
  candidate.auxiliary_knowledge_point_codes = orderedContent.filter(code => {
    const owner = owners.get(code); return owner && owner !== "METHOD" && owner !== candidate.chapter_code;
  }).slice(0, 2);
  candidate.method_codes = [...methods].filter(code => owners.get(code) === "METHOD").slice(0, 2);
  if (candidate.confidence < 0.8 || candidate.review_reasons.length) candidate.needs_review = true;
  return candidate;
}

function applyHighConfidenceContentRules(stage: EducationStage, extraction: VisionExtraction, value: MathClassificationCandidate) {
  const candidate = applyDeterministicClassificationHints(
    stage,
    extraction.extracted_question,
    value,
  );
  const text = extraction.extracted_question.replace(/\s+/g, "");
  if (stage === "初中" && candidate.chapter_code === "FUNC-QUADRATIC" && /(最大值|最小值|最值)/.test(text)
      && !candidate.core_knowledge_point_codes.includes("FUNC-QUADRATIC-EXTREMUM")) {
    if (candidate.core_knowledge_point_codes.length >= 3) candidate.core_knowledge_point_codes.pop();
    candidate.core_knowledge_point_codes.push("FUNC-QUADRATIC-EXTREMUM");
  }
  const polynomialMonotonicity = stage === "高中" && /单调区间/.test(text) && /(x³|x\^3|x3-)/i.test(text);
  if (polynomialMonotonicity && candidate.chapter_code === "HS-FUNCTION") {
    candidate.chapter_code = "HS-DERIVATIVE";
    const needsExtremum = /(最大值|最小值|极值|最值)/.test(text);
    candidate.core_knowledge_point_codes = ["HS-DERIVATIVE-MONOTONICITY", ...(needsExtremum ? ["HS-DERIVATIVE-EXTREMUM"] : [])];
    candidate.auxiliary_knowledge_point_codes = [];
    candidate.classification_notes = needsExtremum ? "通过导数研究多项式函数的单调性与区间最值。" : "通过导数研究多项式函数的单调区间。";
  }
  return normalizeCandidate(
    stage,
    synchronizeCandidateWithClassificationNotes(stage, candidate),
  );
}

async function repairClassification(extraction: VisionExtraction, issues: ClassificationValidationIssue[], stage: EducationStage, config: ProviderConfig, effort: ReasoningEffort, signal: AbortSignal, cacheKey: string, analysisId: string) {
  const baseInstructions = [
    `你是${stage}数学分类复核器。只修复标签冲突，不重新做视觉识别，不输出答案或完整解题过程。`,
    "选择唯一主章节；核心知识点必须属于主章节；必要跨章节知识点放 auxiliary；方法标签放 method；合计不超过4个。分类依据中提到的受控知识点必须同步放入对应数组。",
    taxonomyHierarchyPromptForStage(stage),
    "题型：" + questionTypes.join("、") + "。只返回符合 JSON Schema 的对象。",
  ].join("\n");
  const user = `题目原文：\n${extraction.extracted_question}\n\n需修复：\n${validationRetryReason(issues) || "模型标记需要进一步核对分类。"}`;
  const schema = classificationCandidateSchemaForStage(stage);
  const instructions = instructionsWithSchema(baseInstructions, schema, config);
  const body = config.apiStyle === "chat_completions"
    ? { model: config.classificationModel, messages: [{ role: "system", content: instructions }, { role: "user", content: user }], response_format: structuredOutputFormat(config, "math_classification_repair", schema) }
    : { model: config.classificationModel, instructions, input: [{ role: "user", content: [{ type: "input_text", text: user }] }], text: { format: structuredOutputFormat(config, "math_classification_repair", schema) }, store: false };
  return requestStructuredJson(withReasoning(body, config.apiStyle, effort, cacheKey), config, "分类按需复核", signal, cacheKey, analysisId);
}

async function sha256(value: ArrayBuffer | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function cacheGet(key: string) {
  const memory = memoryCache.get(key);
  if (memory && memory.expires > Date.now()) return structuredClone(memory.classification);
  if (memory) memoryCache.delete(key);
  try {
    const workerCache = (caches as CacheStorage & { default?: Cache }).default;
    const response = await workerCache?.match(new Request(`https://math-analysis-cache.invalid/${key}`));
    return response ? (await response.json() as Classification) : undefined;
  } catch { return undefined; }
}

async function cachePut(key: string, classification: Classification) {
  const clean = structuredClone(classification);
  delete clean.analysis_trace;
  if (memoryCache.size >= 100) memoryCache.delete(memoryCache.keys().next().value!);
  memoryCache.set(key, { expires: Date.now() + CACHE_TTL_SECONDS * 1000, classification: clean });
  try {
    const workerCache = (caches as CacheStorage & { default?: Cache }).default;
    await workerCache?.put(new Request(`https://math-analysis-cache.invalid/${key}`), Response.json(clean, { headers: { "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` } }));
  } catch { /* Memory cache remains available in local development. */ }
}

export async function POST(request: Request) {
  const routeStart = performance.now();
  const analysisId = crypto.randomUUID();
  const form = await request.formData();
  const uploadMs = elapsed(routeStart);
  const image = form.get("image");
  const stage: EducationStage = form.get("educationStage") === "高中" ? "高中" : "初中";
  const requestedEffort = String(form.get("reasoningEffort") || env.OPENAI_REASONING_EFFORT || "low");
  const effort: ReasoningEffort = requestedEffort === "medium" ? "medium" : "low";
  const clientPreprocessMs = Math.max(0, Number(form.get("clientPreprocessMs")) || 0);
  if (!(image instanceof File)) return Response.json({ error: "请选择题目图片。" }, { status: 400 });
  if (!image.type.startsWith("image/")) return Response.json({ error: "只支持图片文件。" }, { status: 400 });
  if (!new Set(["image/jpeg", "image/png"]).has(image.type)) return Response.json({ error: "AI 识别副本只支持 JPG 或 PNG，请先转换格式或使用页面自动预处理。" }, { status: 400 });
  if (image.size > MAX_IMAGE_BYTES) return Response.json({ error: "用于识别的图片不能超过 8 MB。" }, { status: 400 });

  const encoder = new TextEncoder();
  const upstreamController = new AbortController();
  registerAnalysis(analysisId, upstreamController);
  const analysisSignal = AbortSignal.any([request.signal, upstreamController.signal]);
  let streamCancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => { if (!streamCancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
      const timings: Record<string, number> = { upload: uploadMs, client_preprocess: Math.round(clientPreprocessMs * 10) / 10 };
      const usage = emptyUsage();
      const attempts: ClassificationAnalysisTrace["classification_attempts"] = [];
      try {
        send({ type: "status", state: "uploaded", message: "图片已上传" });
        const config = providerConfig();
        if (!config.apiKey) {
          send({ type: "complete", classification: demoClassification(stage), mode: "demo", metrics: { ...timings, total: elapsed(routeStart) }, cacheHit: false });
          return;
        }

        send({ type: "status", state: "preprocessing", message: "正在读取并校验图片" });
        const readStart = performance.now();
        const imageBuffer = await image.arrayBuffer();
        timings.image_read = elapsed(readStart);
        const hashStart = performance.now();
        const imageHash = await sha256(imageBuffer);
        const configKey = `${PROMPT_VERSION}:${taxonomyVersionForStage(stage)}:${stage}:${config.name}:${config.visionModel}:${config.classificationModel}:${effort}`;
        const resultCacheKey = await sha256(`${imageHash}:${configKey}`);
        const promptCacheKey = (await sha256(configKey)).slice(0, 32);
        timings.hash = elapsed(hashStart);

        send({ type: "status", state: "cache_check", message: "正在检查识别缓存" });
        const cacheStart = performance.now();
        const cached = await cacheGet(resultCacheKey);
        timings.cache_lookup = elapsed(cacheStart);
        if (cached) {
          const trace: ClassificationAnalysisTrace = { analysis_id: analysisId, strict_json_schema: config.strictJsonSchema, prompt_version: PROMPT_VERSION, cache_hit: true, reasoning_effort: effort, timings_ms: { ...timings, total: elapsed(routeStart) }, usage, classification_attempts: [] };
          cached.analysis_trace = trace;
          send({ type: "complete", classification: cached, mode: "live", metrics: trace.timings_ms, cacheHit: true });
          console.info(JSON.stringify({ event: "math_analysis_completed", analysis_id: analysisId, stage, cache_hit: true, timings_ms: trace.timings_ms, usage }));
          return;
        }

        send({ type: "status", state: "recognizing", message: "AI 正在识别题干并初步分类" });
        const encodeStart = performance.now();
        const dataUrl = `data:${image.type};base64,${Buffer.from(imageBuffer).toString("base64")}`;
        timings.image_encode = elapsed(encodeStart);
        const fast = await runFastAnalysis(dataUrl, stage, config, effort, analysisSignal, promptCacheKey, analysisId);
        timings.model_first_response = fast.timings.first_response;
        timings.model_complete = fast.timings.complete;
        timings.json_parse = fast.timings.json_parse;
        addUsage(usage, fast.usage);
        const raw = fast.value as { extraction?: unknown; classification?: unknown };
        if (!isVisionExtraction(raw?.extraction)) throw new Error("题干提取结果未通过本地结构校验。");
        const extraction = raw.extraction;
        if ((extraction.extraction_confidence < 0.8 || extraction.review_reasons.length) && !extraction.needs_review) extraction.needs_review = true;

        send({ type: "status", state: "validating", message: "正在校验章节与知识点标签" });
        const validationStart = performance.now();
        let candidate = applyHighConfidenceContentRules(stage, extraction, normalizeCandidate(stage, raw.classification as MathClassificationCandidate));
        let issues = validateClassificationCandidate(stage, candidate);
        timings.validation = elapsed(validationStart);
        attempts.push({ attempt: 1, validation_issues: issues, retry_reason: issues.length ? validationRetryReason(issues) : candidate?.needs_followup ? "模型请求按需复核。" : undefined });

        if (issues.length || candidate?.needs_followup) {
          send({ type: "status", state: "reviewing", message: "发现标签冲突，正在复用题干按需复核" });
          const repair = await repairClassification(extraction, issues, stage, config, effort, analysisSignal, promptCacheKey, analysisId);
          timings.repair_first_response = repair.timings.first_response;
          timings.repair_complete = repair.timings.complete;
          timings.json_parse = Math.round((timings.json_parse + repair.timings.json_parse) * 10) / 10;
          addUsage(usage, repair.usage);
          candidate = applyHighConfidenceContentRules(stage, extraction, normalizeCandidate(stage, repair.value as MathClassificationCandidate));
          issues = validateClassificationCandidate(stage, candidate);
          attempts.push({ attempt: 2, validation_issues: issues, retry_reason: issues.length ? validationRetryReason(issues) : undefined });
        }

        if (issues.length) {
          console.warn(JSON.stringify({ event: "math_classification_rejected", analysis_id: analysisId, issue_codes: issues.map(issue => issue.code) }));
          throw new Error("AI 分类仍存在章节或知识点冲突，请使用已识别题干人工选择标签。");
        }
        const classification = buildClassificationFromCandidate(stage, extraction, candidate);
        timings.total = elapsed(routeStart);
        const trace: ClassificationAnalysisTrace = { analysis_id: analysisId, strict_json_schema: config.strictJsonSchema, prompt_version: PROMPT_VERSION, cache_hit: false, reasoning_effort: effort, timings_ms: timings, usage, classification_attempts: attempts };
        classification.analysis_trace = trace;
        await cachePut(resultCacheKey, classification);
        send({ type: "complete", classification, mode: "live", metrics: timings, cacheHit: false });
        console.info(JSON.stringify({ event: "math_analysis_completed", analysis_id: analysisId, stage, cache_hit: false, effort, provider: config.name, vision_model: config.visionModel, classification_model: config.classificationModel, timings_ms: timings, usage, review_required: classification.needs_review, model_calls: attempts.length }));
      } catch (error) {
        const failure = classifyAnalysisFailure(error);
        const message = failure.message;
        if (streamCancelled) {
          console.info(JSON.stringify({ event: "math_analysis_cancelled", analysis_id: analysisId, stage, timings_ms: { ...timings, total: elapsed(routeStart) } }));
          return;
        }
        console.error(JSON.stringify({ event: "math_analysis_failed", analysis_id: analysisId, stage, error: message, error_name: error instanceof Error ? error.name : "UnknownError", upstream_status: failure.upstreamStatus, provider_request_id: failure.providerRequestId, provider_reference_id: failure.providerReferenceId, client_request_id_sent: true, retryable: failure.retryable, timings_ms: { ...timings, total: elapsed(routeStart) }, usage }));
        send({ type: "error", error: message, analysisId, retryable: failure.retryable, clientRequestIdSent: true, providerRequestId: failure.providerRequestId, providerReferenceId: failure.providerReferenceId });
      } finally {
        unregisterAnalysis(analysisId);
        if (!streamCancelled) controller.close();
      }
    },
    cancel() {
      streamCancelled = true;
      upstreamController.abort();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Analysis-Id": analysisId } });
}

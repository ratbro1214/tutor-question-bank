import { z } from "zod";
export const reasons = [
  "概念理解不清",
  "公式记忆或使用错误",
  "不会选择解题方法",
  "计算错误",
  "审题错误",
  "知识迁移困难",
  "其他",
];
export const methods = [
  "直接讲解",
  "启发式提问",
  "分步提示",
  "例题示范",
  "对比辨析",
  "变式练习",
  "其他",
];
export const outcomes = [
  "尚未讲解",
  "已讲解，尚未复查",
  "仍需提示",
  "能够独立完成",
  "复查通过",
  "仍需巩固",
] as const;
export const attemptStages = [
  "首次作答",
  "诊断检测",
  "干预后检测",
  "间隔复查",
] as const;
export const correctnessOptions = ["错误", "部分正确", "正确"] as const;
export const supportLevels = ["独立完成", "提示后完成", "模仿完成"] as const;
export const evidenceLevels = [
  "仅有最终答案",
  "有部分步骤",
  "有完整过程或教师观察",
] as const;
export const evidenceSources = [
  "考试答题卡",
  "作业",
  "课堂观察",
  "学生口述",
  "其他",
] as const;
export const evidenceDecisions = [
  "未判断",
  "教师确认",
  "教师修正",
  "证据不足",
  "教师否定",
] as const;
export const diagnosisStatuses = ["错因未知", "待验证", "已支持", "已否定"] as const;

export const formulaErrorPatterns = [
  {
    code: "FORMULA_OMIT_MIDDLE",
    label: "遗漏中间项",
    intervention: "用面积模型或分配律说明中间项的来源，再让学生独立推导一次公式。",
    check: "先检测能否独立推导，再用不同系数的完全平方公式题复查。",
  },
  {
    code: "FORMULA_CROSS_TERM",
    label: "交叉项系数错误",
    intervention: "把两个交叉乘积分别写出并合并，突出中间项是 2ab。",
    check: "使用含不同数字和字母系数的基础题检查交叉项计算。",
  },
  {
    code: "FORMULA_SIGN",
    label: "中间项符号错误",
    intervention: "对比 (a+b)^2 与 (a-b)^2，并用分配律核对中间项符号。",
    check: "交替使用和平方、差平方题，检查学生是否能独立判断符号。",
  },
  {
    code: "FORMULA_CONFUSION",
    label: "混淆平方差与完全平方公式",
    intervention: "并列比较三个乘法公式的结构、适用条件和展开结果。",
    check: "先让学生选择公式并说明依据，再完成混合辨析题。",
  },
  {
    code: "FORMULA_PROCEDURE",
    label: "展开步骤不完整或顺序混乱",
    intervention: "先用分配律逐项展开，稳定步骤后再过渡到公式化简。",
    check: "观察学生能否不依赖模板完整写出展开过程。",
  },
] as const;
export const pilotKnowledgePointCode = "ALG-FORMULA";
export const formulaDiagnosticQuestions = [
  "请写出 (a+b)² 的展开式。",
  "请用分配律展开 (x+2)(x+2)，保留中间步骤。",
  "请独立展开 (2x+3)²。",
  "请独立展开 (x-4)²。",
] as const;
const date = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const tags = z.array(z.string().trim().min(1).max(80)).max(20).default([]);
export const learningInput = z
  .object({
    id: z.string().uuid(),
    kind: z.enum([
      "inquiry",
      "attempt",
      "teaching",
      "review",
      "result",
      "relation",
    ]),
    questionId: z.number().int().positive(),
    inquiryId: z.string().max(100).optional(),
    reviewId: z.string().uuid().optional(),
    occurredAt: date,
    dueAt: date.optional(),
    reasons: tags,
    methods: tags,
    outcome: z.enum(outcomes).default("尚未讲解"),
    notes: z.string().max(4000).default(""),
    relatedId: z.number().int().positive().optional(),
    relationKind: z.enum(["同类题", "变式题", "相似错误原因"]).optional(),
    supersedesId: z.string().uuid().optional(),
    attemptStage: z.enum(attemptStages).optional(),
    responseText: z.string().trim().max(4000).optional(),
    correctness: z.enum(correctnessOptions).optional(),
    supportLevel: z.enum(supportLevels).optional(),
    evidenceLevel: z.enum(evidenceLevels).optional(),
    evidenceSource: z.enum(evidenceSources).optional(),
    knowledgePointCode: z.string().trim().max(100).optional(),
    aiHypothesis: z.string().trim().max(1000).optional(),
    teacherDecision: z.enum(evidenceDecisions).optional(),
    errorCode: z.string().trim().max(100).optional(),
    errorLabel: z.string().trim().max(200).optional(),
    evidenceExcerpt: z.string().trim().max(1000).optional(),
    candidateErrorCodes: z.array(z.string().trim().min(1).max(100)).max(5).default([]),
    diagnosisBasis: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.kind === "result" &&
      ["尚未讲解", "已讲解，尚未复查"].includes(value.outcome)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "完成复查时请选择实际表现。",
        path: ["outcome"],
      });
    if (value.kind === "attempt") {
      for (const [field, present] of [
        ["inquiryId", value.inquiryId],
        ["attemptStage", value.attemptStage],
        ["responseText", value.responseText],
        ["correctness", value.correctness],
        ["supportLevel", value.supportLevel],
        ["evidenceLevel", value.evidenceLevel],
        ["evidenceSource", value.evidenceSource],
        ["knowledgePointCode", value.knowledgePointCode],
      ] as const)
        if (!present)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "请完整记录学生真实作答。",
            path: [field],
          });
      if (
        ["教师确认", "教师修正"].includes(value.teacherDecision || "") &&
        (!value.errorCode || !value.errorLabel)
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "教师确认或修正后需要选择具体错误模式。",
          path: ["errorCode"],
        });
    }
  });
export type LearningInput = z.infer<typeof learningInput>;
export type LearningEvent = {
  id: string;
  questionId: number;
  inquiryId?: string;
  reviewId?: string;
  kind: string;
  occurredAt: string;
  notes: string;
  reasons?: string[];
  methods?: string[];
  outcome?: string;
  dueAt?: string;
  supersedesId?: string;
  attemptStage?: (typeof attemptStages)[number];
  responseText?: string;
  correctness?: (typeof correctnessOptions)[number];
  supportLevel?: (typeof supportLevels)[number];
  evidenceLevel?: (typeof evidenceLevels)[number];
  evidenceSource?: (typeof evidenceSources)[number];
  knowledgePointCode?: string;
  aiHypothesis?: string;
  teacherDecision?: (typeof evidenceDecisions)[number];
  errorCode?: string;
  errorLabel?: string;
  evidenceExcerpt?: string;
  diagnosisStatus?: (typeof diagnosisStatuses)[number];
  candidateErrorCodes?: string[];
  diagnosisBasis?: string;
};

export type DiagnosticQueueEntry = {
  attemptId: string;
  questionId: number;
  occurredAt: string;
  evidenceLevel: string;
  evidenceSource: string;
  status: "错因未知" | "待验证" | "已补证" | "未发现持续性证据";
  candidateLabels: string[];
  questions: readonly string[];
};

export function buildDiagnosticQueue(events: LearningEvent[]): DiagnosticQueueEntry[] {
  const attempts = events
    .filter((event) => event.kind === "attempt")
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return attempts
    .filter(
      (event) =>
        event.correctness !== "正确" &&
        event.diagnosisStatus !== "已否定" &&
        !["教师确认", "教师修正"].includes(event.teacherDecision || ""),
    )
    .map((event) => {
      const laterDiagnostics = attempts.filter(
        (later) =>
          later.knowledgePointCode === event.knowledgePointCode &&
          later.occurredAt > event.occurredAt &&
          later.attemptStage === "诊断检测",
      );
      const supported = laterDiagnostics.some(
        (later) =>
          later.errorCode &&
          ["教师确认", "教师修正"].includes(later.teacherDecision || ""),
      );
      const independentCorrect = laterDiagnostics.filter(
        (later) =>
          later.correctness === "正确" && later.supportLevel === "独立完成",
      ).length;
      const status: DiagnosticQueueEntry["status"] = supported
        ? "已补证"
        : independentCorrect >= 2
          ? "未发现持续性证据"
          : event.diagnosisStatus === "待验证"
            ? "待验证"
            : "错因未知";
      return {
        attemptId: event.id,
        questionId: event.questionId,
        occurredAt: event.occurredAt,
        evidenceLevel: event.evidenceLevel || "仅有最终答案",
        evidenceSource: event.evidenceSource || "其他",
        status,
        candidateLabels: (event.candidateErrorCodes || []).flatMap((code) => {
          const pattern = formulaErrorPatterns.find((item) => item.code === code);
          return pattern ? [pattern.label] : [];
        }),
        questions: formulaDiagnosticQuestions.slice(0, 2),
      };
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export type LearnerProfileEntry = {
  knowledgePointCode: string;
  errorCode: string;
  errorLabel: string;
  status: "待验证" | "已确认" | "已实施干预" | "初步改善" | "阶段性稳定" | "再次出现";
  evidenceCount: number;
  latestAt: string;
  latestQuestionId: number;
  intervention: string;
  check: string;
};

export function buildLearnerProfile(events: LearningEvent[]): LearnerProfileEntry[] {
  const attempts = events.filter((event) => event.kind === "attempt");
  const confirmed = attempts.filter(
    (event) =>
      event.errorCode &&
      ["教师确认", "教师修正"].includes(event.teacherDecision || ""),
  );
  const groups = new Map<string, LearningEvent[]>();
  for (const event of confirmed) {
    const key = `${event.knowledgePointCode}:${event.errorCode}`;
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return [...groups.values()]
    .map((evidence) => {
      evidence.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const first = evidence[0];
      const latest = evidence.at(-1)!;
      const laterIndependentCorrect = attempts
        .filter(
          (event) =>
            event.knowledgePointCode === first.knowledgePointCode &&
            event.occurredAt > latest.occurredAt &&
            event.correctness === "正确" &&
            event.supportLevel === "独立完成",
        )
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const teachingAfterEvidence = events.some(
        (event) =>
          event.kind === "teaching" &&
          event.occurredAt > first.occurredAt &&
          evidence.some((item) => item.questionId === event.questionId),
      );
      const independentCorrectBeforeLatest = attempts.some(
        (event) =>
          event.knowledgePointCode === first.knowledgePointCode &&
          event.occurredAt > first.occurredAt &&
          event.occurredAt < latest.occurredAt &&
          event.correctness === "正确" &&
          event.supportLevel === "独立完成",
      );
      let status: LearnerProfileEntry["status"] =
        evidence.length > 1 ? "已确认" : "待验证";
      if (teachingAfterEvidence) status = "已实施干预";
      if (laterIndependentCorrect.length) status = "初步改善";
      if (laterIndependentCorrect.some((event) => event.attemptStage === "间隔复查"))
        status = "阶段性稳定";
      if (independentCorrectBeforeLatest) status = "再次出现";
      const pattern = formulaErrorPatterns.find((item) => item.code === first.errorCode);
      return {
        knowledgePointCode: first.knowledgePointCode || "",
        errorCode: first.errorCode || "",
        errorLabel: first.errorLabel || "未命名错误",
        status,
        evidenceCount: evidence.length,
        latestAt: latest.occurredAt,
        latestQuestionId: latest.questionId,
        intervention: pattern?.intervention || "请教师根据原始作答选择针对性讲解方式。",
        check: pattern?.check || "安排一道新的独立作答题，并记录真实表现。",
      };
    })
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}
export function withinRange(value: string, from: string, to: string) {
  const day = value.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}
export function learningStats(questionIds: number[], events: LearningEvent[]) {
  const selected = events.filter((e) => questionIds.includes(e.questionId));
  const asked = selected.filter((e) => e.kind === "inquiry");
  const completed = new Set(
    selected.filter((e) => e.kind === "result").map((e) => e.reviewId),
  );
  return {
    questions: questionIds.length,
    inquiries: asked.length,
    repeats: asked.length - new Set(asked.map((e) => e.questionId)).size,
    pending: selected.filter((e) => e.kind === "review" && !completed.has(e.id))
      .length,
    completed: completed.size,
  };
}

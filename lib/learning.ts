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

export type ErrorPattern = {
  code: string;
  label: string;
  intervention: string;
  check: string;
};

export const formulaErrorPatterns: readonly ErrorPattern[] = [
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

const commonErrorPatterns: readonly ErrorPattern[] = [
  { code: "COMMON_CONCEPT", label: "概念或定义边界不清", intervention: "回到定义，用一个正例和一个反例辨清对象、条件与结论。", check: "换一种表述给出概念辨析题，要求学生说明判断依据。" },
  { code: "COMMON_CONDITION", label: "遗漏条件或适用范围", intervention: "圈出题设条件，并逐项核对公式、定理或结论的适用前提。", check: "安排一道含隐含条件或参数边界的同类题，检查是否主动核对范围。" },
  { code: "COMMON_FORMULA", label: "公式或定理选择错误", intervention: "比较相近公式的结构与使用条件，再让学生口述选择依据。", check: "用两道外观相近但方法不同的题做选择辨析。" },
  { code: "COMMON_CALCULATION", label: "运算、符号或书写错误", intervention: "定位首个出错步骤，要求分行书写并在关键变形后做逆向验算。", check: "用数据不同的短题独立复算，确认错误没有重复出现。" },
  { code: "COMMON_REASONING", label: "推理链或证明依据不完整", intervention: "把目标拆成若干可验证的小结论，每一步补写所用依据。", check: "安排同结构证明或推理题，检查必要步骤与依据是否齐全。" },
  { code: "COMMON_MODEL", label: "题意转化或建模错误", intervention: "重新定义变量，逐句把数量关系翻译为式子、图形或概率事件。", check: "更换情境但保留数学结构，检查能否独立建立模型。" },
] as const;

const seniorErrorPatterns: Record<string, readonly ErrorPattern[]> = {
  logic: [
    { code: "LOGIC_DIRECTION", label: "充分、必要方向判断颠倒", intervention: "固定写成“条件推出结论”，分别检查正向与逆向是否成立。", check: "用集合包含关系和命题互推各做一道辨析。" },
    { code: "SET_OPERATION", label: "集合关系或运算对象混淆", intervention: "先标出全集与元素范围，再用数轴或维恩图完成交并补运算。", check: "更换表示法，检查能否在列举、描述和区间之间转换。" },
    { code: "QUANTIFIER_NEGATION", label: "量词否定错误", intervention: "按“全称↔存在、结论取否定”逐项改写，不跳步。", check: "交替否定全称命题和存在命题。" },
  ],
  function: [
    { code: "FUNCTION_DOMAIN", label: "定义域、值域或约束遗漏", intervention: "先列分母、根式、对数等约束，再研究对应关系和值域。", check: "用复合限制或参数函数检查约束是否列全。" },
    { code: "FUNCTION_GRAPH", label: "函数性质与图像对应错误", intervention: "把单调、奇偶、周期、零点等性质逐一对应到图像特征。", check: "在解析式、性质表述和图像之间做双向转换。" },
    { code: "FUNCTION_PARAMETER", label: "含参问题临界值或分类遗漏", intervention: "寻找使定义域、根数、单调性或最值发生变化的临界参数。", check: "安排一道参数分区不同的同类题，要求写出完整分类。" },
    { code: "EXP_LOG_BASE", label: "指数对数底数条件或运算错误", intervention: "先核对底数大于零且不等于一，再使用指数、对数运算法则。", check: "混合设置底数条件、换底与方程不等式短题。" },
  ],
  trigVector: [
    { code: "TRIG_ANGLE", label: "角、弧度或象限判断错误", intervention: "统一角度单位，在单位圆中标出终边和三角函数符号。", check: "用跨象限角与负角检查弧度换算和符号判断。" },
    { code: "TRIG_FORMULA", label: "三角公式结构或符号错误", intervention: "先辨认同角、诱导、和差或倍角结构，再逐项核对符号。", check: "安排公式选择与正反向变形各一道。" },
    { code: "VECTOR_DIRECTION", label: "向量方向、坐标或基底使用错误", intervention: "统一向量起终点和基底，把几何关系翻译成坐标或线性关系。", check: "更换坐标系或基底，复查平行、垂直和共线条件。" },
    { code: "TRIANGLE_LAW", label: "正余弦定理选择或边角对应错误", intervention: "先标注已知边角及其对边，再根据条件结构选择定理。", check: "用边角条件不同的两道题检查定理选择。" },
  ],
  geometry: [
    { code: "GEOMETRY_RELATION", label: "点线面位置关系判定不充分", intervention: "区分判定定理与性质定理，逐项验证所需条件。", check: "用一题证明平行、一题证明垂直检查依据完整性。" },
    { code: "GEOMETRY_ANGLE_DISTANCE", label: "空间角或距离对象识别错误", intervention: "先明确所求角或距离的定义，再作垂线、投影或建立坐标系。", check: "改变几何体朝向，检查能否稳定找出对应对象。" },
    { code: "GEOMETRY_COORDINATE", label: "坐标、方向向量或法向量设置错误", intervention: "检查原点、坐标轴与基向量，随后逐点复核坐标。", check: "在新的几何体中独立建系并验证一个点积关系。" },
    { code: "CONIC_CONDITION", label: "圆锥曲线定义、参数或范围遗漏", intervention: "回到定义和标准方程，标清焦点、准线、长短轴及参数范围。", check: "用不同放置方向的圆锥曲线辨认参数和几何量。" },
    { code: "CONIC_INTERSECTION", label: "直线与曲线联立或韦达关系错误", intervention: "规范完成联立、判别式、根与系数关系及几何量转换。", check: "安排一道弦长或中点问题，检查代数与几何条件是否同时使用。" },
  ],
  sequenceDerivative: [
    { code: "SEQUENCE_INDEX", label: "项数、下标或通项对应错误", intervention: "列出前几项核对首项与下标，再代入通项或递推式。", check: "更换首项编号，检查通项与项数能否正确对应。" },
    { code: "SEQUENCE_SUM", label: "数列求和方法选择或边界错误", intervention: "先识别等差、等比、裂项、错位相减等结构，并核对首尾项。", check: "用结构相近的两种数列比较求和方法。" },
    { code: "DERIVATIVE_SIGN", label: "导数符号与单调区间对应错误", intervention: "画出导数符号表，逐区间对应原函数增减性。", check: "用含多个临界点的函数独立完成符号表。" },
    { code: "DERIVATIVE_CRITICAL", label: "切点、驻点或端点遗漏", intervention: "区分切点、导数为零点和区间端点，并分别代回比较。", check: "安排闭区间最值题，检查候选点是否完整。" },
    { code: "DERIVATIVE_PARAMETER", label: "导数含参讨论临界情形遗漏", intervention: "先找导函数根的个数、位置或符号发生变化的参数临界值。", check: "改变参数范围，要求完整写出分段结论。" },
  ],
  probabilityStatistics: [
    { code: "PROB_MODEL", label: "概率模型或事件关系判断错误", intervention: "先写清样本空间与事件，判断等可能、独立、互斥或条件关系。", check: "用外观相似的古典概型、条件概率各做一道辨析。" },
    { code: "PROB_COUNT", label: "计数重复、遗漏或顺序判断错误", intervention: "明确分类与分步，标注是否考虑顺序、是否允许重复。", check: "用有限制条件的排列组合题核对计数口径。" },
    { code: "RANDOM_DISTRIBUTION", label: "随机变量取值或概率分布不完整", intervention: "先列出随机变量全部可能取值，再逐项计算并检查概率和为一。", check: "更换试验条件，独立写出分布列并求均值。" },
    { code: "STAT_SAMPLE", label: "抽样方法或统计结论适用范围错误", intervention: "区分总体、样本和抽样方法，避免把样本特征直接当作总体事实。", check: "给出不同调查情境，选择抽样方法并说明偏差来源。" },
    { code: "STAT_METRIC", label: "统计量、图表或回归解释错误", intervention: "结合数据背景解释均值、方差、百分位数、相关和回归系数。", check: "换一组图表数据，要求计算并用完整语句解释结论。" },
  ],
  complex: [
    { code: "COMPLEX_OPERATION", label: "复数运算或 i 的幂次错误", intervention: "按实部、虚部分组运算，并用 i²=-1 化简。", check: "混合四则运算与共轭复数做短题复查。" },
    { code: "COMPLEX_GEOMETRY", label: "复数与复平面对应错误", intervention: "把实部、虚部分别对应横纵坐标，再解释模与辐角的几何意义。", check: "在代数式、点和向量三种表示间相互转换。" },
  ],
};

export const supportedQuickAttemptKnowledgePointPrefixes = ["HS-", "ALG-FORMULA"] as const;

function seniorPatternGroup(code: string) {
  if (/^HS-(SET|LOGIC|INEQ|EQ-)/.test(code)) return "logic";
  if (/^HS-(FUNC|POWER|EXP|LOG)-/.test(code)) return "function";
  if (/^HS-(TRIG|VECTOR|TRIANGLE)-/.test(code)) return "trigVector";
  if (/^HS-(SOLID|SPACE-VECTOR|ANALYTIC)-/.test(code)) return "geometry";
  if (/^HS-(SEQ|DERIVATIVE)-/.test(code)) return "sequenceDerivative";
  if (/^HS-(PROB|STAT|COUNTING|RANDOM)-/.test(code)) return "probabilityStatistics";
  if (/^HS-COMPLEX-/.test(code)) return "complex";
  return "";
}

export function supportsQuickAttempt(code: string) {
  return supportedQuickAttemptKnowledgePointPrefixes.some((prefix) => code.startsWith(prefix));
}

export function errorPatternsForKnowledgePoint(code: string): readonly ErrorPattern[] {
  if (code === "ALG-FORMULA") return [...formulaErrorPatterns, ...commonErrorPatterns.slice(1, 3)];
  const group = seniorPatternGroup(code);
  return group ? [...seniorErrorPatterns[group], ...commonErrorPatterns] : commonErrorPatterns;
}

export function errorPatternByCode(code: string) {
  return [...formulaErrorPatterns, ...Object.values(seniorErrorPatterns).flat(), ...commonErrorPatterns]
    .find((item) => item.code === code);
}

export const formulaDiagnosticQuestions = [
  "请写出 (a+b)² 的展开式。",
  "请用分配律展开 (x+2)(x+2)，保留中间步骤。",
  "请独立展开 (2x+3)²。",
  "请独立展开 (x-4)²。",
] as const;

export function diagnosticQuestionsForKnowledgePoint(code: string): readonly string[] {
  if (code === "ALG-FORMULA") return formulaDiagnosticQuestions;
  const group = seniorPatternGroup(code);
  const questions: Record<string, readonly string[]> = {
    logic: ["请用定义或集合关系重新判断一道基础命题。", "请说明本题每个条件在结论中的作用。"],
    function: ["请先写出定义域，再判断一个最基础的函数性质。", "请在解析式、性质和图像之间完成一次对应。"],
    trigVector: ["请用单位圆或坐标表示核对关键角、符号或向量关系。", "请完成一道只含一个公式或定理的基础变式。"],
    geometry: ["请先指出所用几何定义或判定定理的全部条件。", "请用几何法或坐标法独立完成一道最小变式。"],
    sequenceDerivative: ["请列出关键项、临界点或符号表后再作结论。", "请完成一道只改变数据或参数范围的同结构题。"],
    probabilityStatistics: ["请写清样本空间、随机变量或统计对象后再计算。", "请说明所得概率或统计量在题目情境中的含义。"],
    complex: ["请分离实部与虚部，完成一次基础运算。", "请把同一个复数分别表示为代数式和复平面上的点。"],
  };
  return questions[group] || ["请用定义完成一道最基础的同知识点题。", "请独立完成一道只改变数据的同结构题。"];
}
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
          const pattern = errorPatternByCode(code);
          return pattern ? [pattern.label] : [];
        }),
        questions: diagnosticQuestionsForKnowledgePoint(event.knowledgePointCode || "").slice(0, 2),
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
      const pattern = errorPatternByCode(first.errorCode || "");
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

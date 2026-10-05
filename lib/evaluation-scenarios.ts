import type { LearningEvent, LearnerProfileEntry } from "./learning";
import type { AgentQuestion, TeachingActionKind } from "./teaching-agent";

export type ReplayCheckpoint = {
  at: string;
  expectedActions: TeachingActionKind[];
  expectedProfile: LearnerProfileEntry["status"] | null;
  reason: string;
};
export type ReplayScenario = {
  id: string;
  title: string;
  questions: AgentQuestion[];
  events: LearningEvent[];
  checkpoints: ReplayCheckpoint[];
};
const questions: AgentQuestion[] = [{ id: 1, chapterName: "整式与因式分解", knowledgePoints: [{ code: "ALG-FORMULA", name: "乘法公式" }] }];
const time = (day: number) => `2026-09-${String(day).padStart(2, "0")}T08:00:00.000Z`;
const inquiry: LearningEvent = { id: "ask-1", questionId: 1, kind: "inquiry", occurredAt: time(1), notes: "合成场景" };
const wrong: LearningEvent = { ...inquiry, id: "wrong-1", inquiryId: inquiry.id, kind: "attempt", occurredAt: time(2), attemptStage: "首次作答", knowledgePointCode: "ALG-FORMULA", responseText: "(x+3)²=x²+9", correctness: "错误", supportLevel: "独立完成", evidenceLevel: "仅有最终答案", evidenceSource: "作业", diagnosisStatus: "错因未知" };
const confirmed: LearningEvent = { ...wrong, evidenceLevel: "有完整过程或教师观察", teacherDecision: "教师确认", errorCode: "FORMULA_OMIT_MIDDLE", errorLabel: "遗漏中间项", diagnosisStatus: "已支持" };
const correct = (id: string, day: number, overrides: Partial<LearningEvent> = {}): LearningEvent => ({ ...wrong, id, occurredAt: time(day), attemptStage: "诊断检测", diagnosticItemId: id, targetAttemptId: wrong.id, responseText: "(a+b)²=a²+2ab+b²", correctness: "正确", ...overrides });
const checkpoint = (day: number, actions: TeachingActionKind[], profile: ReplayCheckpoint["expectedProfile"], reason: string): ReplayCheckpoint => ({ at: time(day), expectedActions: actions, expectedProfile: profile, reason });
const scenario = (id: string, title: string, events: LearningEvent[], checkpoints: ReplayCheckpoint[]): ReplayScenario => ({ id, title, questions, events, checkpoints });

// These are authored acceptance expectations, not expert-labelled student data.
export const replayScenarios: ReplayScenario[] = [
  scenario("inquiry-only", "只有提问，先收集证据", [inquiry], [checkpoint(1, ["collect_evidence"], null, "提问本身不能确定错因或讲解策略。")]),
  scenario("unknown-error", "最终答案错误，先诊断", [inquiry, wrong], [checkpoint(2, ["diagnose"], null, "只有答案，不能把遗漏中间项直接确认为持续错因。")]),
  scenario("single-confirmation", "一次具体错因仍需验证", [inquiry, confirmed], [checkpoint(2, ["review"], "待验证", "教师观察支持本次错因，但一次记录不足以说明持续性。")]),
  scenario("repeated-error", "重复确认后针对性干预", [inquiry, confirmed, { ...confirmed, id: "wrong-2", occurredAt: time(3) }], [checkpoint(2, ["review"], "待验证", "此时第二条记录尚未发生。"), checkpoint(3, ["teach"], "已确认", "两次教师确认的同类错误支持针对性干预。")]),
  scenario("linked-intervention", "讲解、独立检测与间隔复查", [inquiry, confirmed,
    { id: "teaching-1", questionId: 1, inquiryId: inquiry.id, kind: "teaching", occurredAt: time(3), notes: "分配律说明交叉项", methods: ["启发式提问"] },
    correct("check-1", 4, { attemptStage: "干预后检测" }), correct("interval-1", 8, { attemptStage: "间隔复查" })],
    [checkpoint(3, ["review"], "已实施干预", "讲解不等于学生会独立做题。"), checkpoint(4, ["review"], "初步改善", "明确关联的独立正确检测支持初步改善。"), checkpoint(8, [], "阶段性稳定", "后续明确关联的独立间隔复查提供进一步证据。")]),
  scenario("unrelated-success", "同知识点正确不替原错题补证", [inquiry, confirmed, correct("unrelated-1", 4, { targetAttemptId: undefined })], [checkpoint(4, ["review"], "待验证", "不能把未关联的正确作答当作原错因改善。")]),
  scenario("prompted-success", "提示后正确不算独立改善", [inquiry, confirmed, correct("prompted-1", 4, { supportLevel: "提示后完成" })], [checkpoint(4, ["review"], "待验证", "提示后完成不能替代独立检查。")]),
  scenario("two-probes", "两道不同诊断题的结果", [inquiry, wrong, correct("probe-1", 3), correct("probe-2", 4)], [checkpoint(3, ["diagnose"], null, "一题正确还不能完成两题最小诊断。"), checkpoint(4, [], null, "两题独立正确未发现持续错误证据，但不创建掌握画像。")]),
  scenario("retry-one-probe", "同题重试不冒充第二题", [inquiry, wrong, correct("probe-1", 3), correct("retry-1", 4, { diagnosticItemId: "probe-1" })], [checkpoint(4, ["diagnose"], null, "重复同一题不能计为两题独立诊断。")]),
  scenario("recurrence", "改善、复发与再次改善", [inquiry, confirmed, correct("check-1", 3), { ...confirmed, id: "wrong-2", occurredAt: time(4) }, correct("check-2", 5, { targetAttemptId: "wrong-2" })], [checkpoint(3, ["review"], "初步改善", "当前已有独立检查。"), checkpoint(4, ["teach"], "再次出现", "改善后的同类错误需要重新干预。"), checkpoint(5, ["review"], "初步改善", "复发后新的关联检查可以更新状态。")]),
  scenario("new-inquiry", "旧作答不能覆盖新的提问", [inquiry, { ...wrong, correctness: "正确" }, { ...inquiry, id: "ask-2", occurredAt: time(4) }], [checkpoint(4, ["collect_evidence"], null, "同一题的新提问没有本次作答，应重新收集证据。")]),
  scenario("unrelated-teaching", "其他提问的讲解不视为本次干预", [inquiry, confirmed, { ...inquiry, id: "ask-2", occurredAt: time(3) }, { id: "teaching-other", questionId: 1, inquiryId: "ask-2", kind: "teaching", occurredAt: time(4), notes: "其他提问的讲解" }], [checkpoint(4, ["review", "collect_evidence"], "待验证", "讲解必须对应原证据提问；新提问还缺真实作答。")]),
  scenario("scheduled-review", "教师复查安排与完成", [inquiry, { ...wrong, correctness: "正确" },
    { id: "review-1", questionId: 1, inquiryId: inquiry.id, kind: "review", occurredAt: time(3), dueAt: time(4), notes: "复查乘法公式" },
    { id: "result-1", questionId: 1, inquiryId: inquiry.id, kind: "result", reviewId: "review-1", occurredAt: time(6), notes: "完成复查", outcome: "复查通过" }],
    [checkpoint(5, ["review"], null, "逾期复查应保留教师安排依据，后来的结果不能提前消除任务。"), checkpoint(6, [], null, "复查任务完成后消失；普通完成记录不冒充具体错因的关联作答。")]),
];

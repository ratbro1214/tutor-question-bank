import {
  buildDiagnosticQueue,
  buildLearnerProfile,
  type LearningEvent,
} from "@/lib/learning";

export type AgentQuestion = {
  id: number;
  chapterName: string;
  knowledgePoints: { code: string; name: string }[];
};

export type TeachingActionKind =
  | "collect_evidence"
  | "diagnose"
  | "teach"
  | "review";

export type TeachingAction = {
  id: string;
  kind: TeachingActionKind;
  priority: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  questionId: number;
  knowledgePointCode?: string;
  knowledgePointName?: string;
  title: string;
  summary: string;
  rationale: string[];
  evidence: { eventId: string; occurredAt: string; label: string }[];
  suggestedSteps: readonly string[];
  requiresTeacherApproval: true;
  dueAt?: string;
};

export type TeachingAgentPlan = {
  generatedAt: string;
  evidenceEventCount: number;
  actions: TeachingAction[];
  notice: string;
};

const priorityRank = { high: 0, medium: 1, low: 2 } as const;

function questionContext(questions: AgentQuestion[], questionId: number, code?: string) {
  const question = questions.find((item) => item.id === questionId);
  const point = question?.knowledgePoints.find((item) => item.code === code);
  return {
    chapterName: question?.chapterName || "未标注章节",
    knowledgePointName: point?.name || code || "未标注知识点",
  };
}

function daysFrom(now: Date, value: string) {
  return Math.floor((now.getTime() - new Date(value).getTime()) / 86_400_000);
}

export function buildTeachingAgentPlan(
  questions: AgentQuestion[],
  events: LearningEvent[],
  now = new Date(),
): TeachingAgentPlan {
  const actions: TeachingAction[] = [];
  const completedReviewIds = new Set(
    events.filter((event) => event.kind === "result").map((event) => event.reviewId),
  );

  for (const review of events.filter(
    (event) => event.kind === "review" && !completedReviewIds.has(event.id),
  )) {
    const overdueDays = review.dueAt ? daysFrom(now, review.dueAt) : 0;
    const context = questionContext(questions, review.questionId);
    actions.push({
      id: `review:${review.id}`,
      kind: "review",
      priority: overdueDays >= 0 ? "high" : "medium",
      confidence: "high",
      questionId: review.questionId,
      title: overdueDays > 0 ? `完成逾期 ${overdueDays} 天的复查` : "完成已安排的复查",
      summary: `${context.chapterName}已有教师安排的复查任务，请记录学生本次真实表现。`,
      rationale: ["存在尚未完成的教师复查安排", "复查结果需由本次独立作答或教师观察提供"],
      evidence: [{ eventId: review.id, occurredAt: review.occurredAt, label: "教师复查安排" }],
      suggestedSteps: ["让学生独立完成一道同知识点新题", "记录正确性、提示程度和完整过程", "根据真实表现完成复查记录"],
      requiresTeacherApproval: true,
      dueAt: review.dueAt,
    });
  }

  for (const item of buildDiagnosticQueue(events).filter(
    (entry) => !["已补证", "未发现持续性证据"].includes(entry.status),
  )) {
    const source = events.find((event) => event.id === item.attemptId);
    const context = questionContext(questions, item.questionId, source?.knowledgePointCode);
    actions.push({
      id: `diagnose:${item.attemptId}`,
      kind: "diagnose",
      priority: "high",
      confidence: item.evidenceLevel === "仅有最终答案" ? "low" : "medium",
      questionId: item.questionId,
      knowledgePointCode: source?.knowledgePointCode,
      knowledgePointName: context.knowledgePointName,
      title: `用最小诊断确认“${context.knowledgePointName}”错因`,
      summary: "当前证据只能说明作答未成功，不能确定具体错因。先用两道区分度较高的小题补证。",
      rationale: [
        `${item.evidenceSource}提供的证据等级为“${item.evidenceLevel}”`,
        item.candidateLabels.length
          ? `候选错因：${item.candidateLabels.join("、")}，尚未得到教师确认`
          : "尚无可被支持的具体错因",
      ],
      evidence: [{ eventId: item.attemptId, occurredAt: item.occurredAt, label: "未完成诊断的真实作答" }],
      suggestedSteps: item.questions,
      requiresTeacherApproval: true,
    });
  }

  for (const profile of buildLearnerProfile(events)) {
    if (profile.status === "阶段性稳定") continue;
    const context = questionContext(
      questions,
      profile.latestQuestionId,
      profile.knowledgePointCode,
    );
    const needsTeaching = ["已确认", "再次出现"].includes(profile.status);
    actions.push({
      id: `${needsTeaching ? "teach" : "review"}:${profile.knowledgePointCode}:${profile.errorCode}`,
      kind: needsTeaching ? "teach" : "review",
      priority: profile.status === "再次出现" ? "high" : "medium",
      confidence: profile.evidenceCount >= 2 ? "high" : "medium",
      questionId: profile.latestQuestionId,
      knowledgePointCode: profile.knowledgePointCode,
      knowledgePointName: context.knowledgePointName,
      title: needsTeaching
        ? `针对“${profile.errorLabel}”实施干预`
        : `验证“${profile.errorLabel}”是否仍然出现`,
      summary: needsTeaching ? profile.intervention : profile.check,
      rationale: [
        `${profile.evidenceCount} 条教师确认或修正的作答证据`,
        `当前证据状态：${profile.status}`,
      ],
      evidence: [{
        eventId: `${profile.knowledgePointCode}:${profile.errorCode}`,
        occurredAt: profile.latestAt,
        label: `最近一次“${profile.errorLabel}”证据`,
      }],
      suggestedSteps: needsTeaching
        ? [profile.intervention, profile.check]
        : [profile.check, "把新作答与原始证据分开记录"],
      requiresTeacherApproval: true,
    });
  }

  const attemptedQuestionIds = new Set(
    events.filter((event) => event.kind === "attempt").map((event) => event.questionId),
  );
  const unansweredInquiry = [...events]
    .filter((event) => event.kind === "inquiry" && !attemptedQuestionIds.has(event.questionId))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  if (unansweredInquiry) {
    const context = questionContext(questions, unansweredInquiry.questionId);
    actions.push({
      id: `collect:${unansweredInquiry.id}`,
      kind: "collect_evidence",
      priority: "medium",
      confidence: "low",
      questionId: unansweredInquiry.questionId,
      title: "先补充一次真实作答证据",
      summary: `${context.chapterName}目前只有提问记录，信息不足以判断应诊断还是讲解。`,
      rationale: ["已记录学生提问", "没有找到该题的真实作答过程或结果"],
      evidence: [{ eventId: unansweredInquiry.id, occurredAt: unansweredInquiry.occurredAt, label: "学生提问" }],
      suggestedSteps: ["记录学生原始答案或关键步骤", "标注是否独立完成及教师提供的提示", "证据不足时保持错因未判断"],
      requiresTeacherApproval: true,
    });
  }

  const unique = new Map<string, TeachingAction>();
  for (const action of actions) {
    const key = `${action.kind}:${action.questionId}:${action.knowledgePointCode || ""}`;
    const previous = unique.get(key);
    if (!previous || priorityRank[action.priority] < priorityRank[previous.priority])
      unique.set(key, action);
  }

  return {
    generatedAt: now.toISOString(),
    evidenceEventCount: events.length,
    actions: [...unique.values()]
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
      .slice(0, 8),
    notice: "建议仅依据已保存证据生成，不代表掌握率；采用前需教师核对原始作答。",
  };
}

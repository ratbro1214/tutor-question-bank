"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TeachingAgentPanel } from "@/components/teaching-agent-panel";
import { EvidenceTrail } from "@/components/evidence-trail";
import type { DiagnosticItem, DiagnosticPackage } from "@/lib/diagnostic-generation";
import {
  attemptStages,
  buildDiagnosticQueue,
  buildLearnerProfile,
  correctnessOptions,
  evidenceDecisions,
  evidenceLevels,
  evidenceSources,
  errorPatternByCode,
  errorPatternsForKnowledgePoint,
  learningInput,
  learningStats,
  methods,
  outcomes,
  reasons,
  supportsQuickAttempt,
  supportLevels,
  withinRange,
  type LearningEvent,
  type LearningInput,
} from "@/lib/learning";
type Question = {
  id: number;
  chapterName: string;
  chapterCode: string;
  knowledgePoints: { code: string; name: string }[];
};
type Relation = {
  id: string;
  question_id: number;
  related_id: number;
  kind: string;
};
const labels: Record<string, string> = {
  inquiry: "提问",
  attempt: "快速记录作答结果",
  teaching: "教师讲解 / 更新状态",
  review: "安排复查",
  result: "完成复查",
  relation: "关联相似题目",
};
const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
};
export function LearningPanel({
  studentId,
  questions,
  questionId,
  diagnosticPlanId,
  onOpen,
}: {
  studentId: string;
  questions: Question[];
  questionId?: number;
  diagnosticPlanId?: string;
  onOpen: (id: number) => void;
}) {
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<LearningInput["kind"]>("inquiry");
  const [inquiryId, setInquiry] = useState("");
  const [reviewId, setReview] = useState("");
  const [relatedId, setRelated] = useState("");
  const [relationKind, setRelationKind] = useState("同类题");
  const [reasonTags, setReasons] = useState<string[]>([]);
  const [methodTags, setMethods] = useState<string[]>([]);
  const [customReason, setCustomReason] = useState("");
  const [customMethod, setCustomMethod] = useState("");
  const [outcome, setOutcome] = useState<string>(outcomes[0]);
  const [notes, setNotes] = useState("");
  const [at, setAt] = useState(localNow);
  const [due, setDue] = useState("");
  const [supersedes, setSupersedes] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chapter, setChapter] = useState("");
  const [point, setPoint] = useState("");
  const [tab, setTab] = useState("timeline");
  const [attemptStage, setAttemptStage] = useState<(typeof attemptStages)[number]>(attemptStages[0]);
  const [responseText, setResponseText] = useState("");
  const [correctness, setCorrectness] = useState<(typeof correctnessOptions)[number]>(correctnessOptions[0]);
  const [supportLevel, setSupportLevel] = useState<(typeof supportLevels)[number]>(supportLevels[0]);
  const [evidenceLevel, setEvidenceLevel] = useState<(typeof evidenceLevels)[number]>(evidenceLevels[0]);
  const [evidenceSource, setEvidenceSource] = useState<(typeof evidenceSources)[number]>(evidenceSources[0]);
  const [aiHypothesis, setAiHypothesis] = useState("");
  const [teacherDecision, setTeacherDecision] = useState<(typeof evidenceDecisions)[number]>(evidenceDecisions[0]);
  const [knowledgePointCode, setKnowledgePointCode] = useState("");
  const [errorCode, setErrorCode] = useState<string>("");
  const [evidenceExcerpt, setEvidenceExcerpt] = useState("");
  const [candidateCodes, setCandidateCodes] = useState<string[]>([]);
  const [diagnosisBasis, setDiagnosisBasis] = useState("");
  const [adoptedDiagnostic, setAdoptedDiagnostic] = useState<{ id: string; sourceAttemptId: string; value: DiagnosticPackage; knowledgePointCode: string; items: DiagnosticItem[] } | null>(null);
  const [diagnosticItemId, setDiagnosticItemId] = useState("");
  const [targetAttemptId, setTargetAttemptId] = useState("");
  const token = useRef(crypto.randomUUID());
  const locked = useRef(false);
  const previousPayload = useRef("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const r = await fetch(`/api/students/${studentId}/learning`, {
        signal,
        cache: "no-store",
      });
      const data = (await r.json()) as {
        error: string;
        events: LearningEvent[];
        relations: Relation[];
      };
      if (!r.ok) throw new Error(data.error);
      if (!signal?.aborted) {
        setEvents(data.events);
        setRelations(data.relations);
      }
    },
    [studentId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => load(controller.signal))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!diagnosticPlanId || !questionId) return;
    const controller = new AbortController();
    void fetch(`/api/students/${studentId}/agent/diagnostics`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { error?: string; plans?: Array<{ id: string; questionId: number; status: string; sourceAttemptId: string; knowledgePointCode: string; package: DiagnosticPackage; items: DiagnosticItem[] }> };
        if (!response.ok) throw new Error(data.error || "诊断方案加载失败。");
        const selected = data.plans?.find((item) => item.id === diagnosticPlanId && item.questionId === questionId && item.status === "adopted");
        if (!selected) throw new Error("没有找到已采用的诊断方案。");
        setAdoptedDiagnostic({ id: selected.id, sourceAttemptId: selected.sourceAttemptId, value: selected.package, knowledgePointCode: selected.knowledgePointCode, items: selected.items });
        setDiagnosticItemId(selected.items[0]?.id || "");
        setTargetAttemptId(selected.sourceAttemptId);
        setKind("attempt");
        setAttemptStage("诊断检测");
        setKnowledgePointCode(selected.knowledgePointCode);
        setEvidenceSource("课堂观察");
        setEvidenceLevel("有部分步骤");
        setDiagnosisBasis(selected.package.diagnostic_goal);
        setMessage("已载入教师采用的诊断方案，请完成后记录学生真实作答。");
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "诊断方案加载失败。"); });
    return () => controller.abort();
  }, [diagnosticPlanId, questionId, studentId]);
  useEffect(() => {
    if (!events.length || !window.location.hash.startsWith("#learning-event-")) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [events]);
  const scopedQuestions = questions.filter(
    (q) =>
      (!questionId || q.id === questionId) &&
      (!chapter || q.chapterCode === chapter) &&
      (!point || q.knowledgePoints.some((k) => k.code === point)),
  );
  const scoped = events.filter((e) =>
    scopedQuestions.some((q) => q.id === e.questionId),
  );
  const visible = scoped.filter((e) => withinRange(e.occurredAt, from, to));
  const asks = events.filter(
    (e) => e.questionId === questionId && e.kind === "inquiry",
  );
  const diagnosticInquiry = diagnosticItemId && adoptedDiagnostic
    ? events.find((event) => event.id === adoptedDiagnostic.sourceAttemptId)?.inquiryId
    : undefined;
  const activeInquiry = diagnosticInquiry || inquiryId || asks.at(-1)?.id || "";
  const plans = events.filter(
    (e) =>
      e.kind === "review" &&
      e.inquiryId === activeInquiry &&
      !events.some((c) => c.reviewId === e.id),
  );
  const stats = learningStats(
    scopedQuestions.map((q) => q.id),
    events,
  );
  const profiles = buildLearnerProfile(events);
  const diagnosticQueue = buildDiagnosticQueue(events);
  const currentQuestion = useMemo(
    () => questions.find((q) => q.id === questionId),
    [questionId, questions],
  );
  const quickAttemptPoints = useMemo(
    () => currentQuestion?.knowledgePoints.filter((pointItem) => supportsQuickAttempt(pointItem.code)) || [],
    [currentQuestion],
  );
  const supportsAttempt = quickAttemptPoints.length > 0;
  const activeKnowledgePointCode = quickAttemptPoints.some((pointItem) => pointItem.code === knowledgePointCode)
    ? knowledgePointCode
    : quickAttemptPoints[0]?.code || "";
  const activeErrorPatterns = errorPatternsForKnowledgePoint(activeKnowledgePointCode);
  const activeErrorCode = activeErrorPatterns.some((item) => item.code === errorCode)
    ? errorCode
    : activeErrorPatterns[0]?.code || "";
  const activeCandidateCodes = candidateCodes.filter((code) =>
    activeErrorPatterns.some((item) => item.code === code),
  );
  async function save() {
    if (locked.current || !questionId) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = learningInput.parse({
        id: token.current,
        kind,
        questionId,
        inquiryId: activeInquiry || undefined,
        diagnosticItemId: kind === "attempt" ? diagnosticItemId || undefined : undefined,
        targetAttemptId: kind === "attempt" ? targetAttemptId || undefined : undefined,
        reviewId: reviewId || undefined,
        relatedId: relatedId ? Number(relatedId) : undefined,
        relationKind,
        occurredAt: new Date(at).toISOString(),
        dueAt: due ? new Date(due).toISOString() : undefined,
        reasons: [
          ...reasonTags,
          ...customReason
            .split(/[，,]/)
            .map((x) => x.trim())
            .filter(Boolean),
        ],
        methods: [
          ...methodTags,
          ...customMethod
            .split(/[，,]/)
            .map((x) => x.trim())
            .filter(Boolean),
        ],
        outcome,
        notes,
        supersedesId: supersedes || undefined,
        attemptStage: kind === "attempt" ? attemptStage : undefined,
        responseText: kind === "attempt" ? responseText : undefined,
        correctness: kind === "attempt" ? correctness : undefined,
        supportLevel: kind === "attempt" ? supportLevel : undefined,
        evidenceLevel: kind === "attempt" ? evidenceLevel : undefined,
        evidenceSource: kind === "attempt" ? evidenceSource : undefined,
        knowledgePointCode: kind === "attempt" ? activeKnowledgePointCode : undefined,
        aiHypothesis: kind === "attempt" && correctness !== "正确" ? aiHypothesis : undefined,
        teacherDecision: kind === "attempt" && correctness !== "正确" ? teacherDecision : undefined,
        errorCode:
          kind === "attempt" && correctness !== "正确" && ["教师确认", "教师修正"].includes(teacherDecision)
            ? activeErrorCode
            : undefined,
        errorLabel:
          kind === "attempt" && correctness !== "正确" && ["教师确认", "教师修正"].includes(teacherDecision)
            ? activeErrorPatterns.find((item) => item.code === activeErrorCode)?.label
            : undefined,
        evidenceExcerpt: kind === "attempt" && correctness !== "正确" ? evidenceExcerpt : undefined,
        candidateErrorCodes: kind === "attempt" && correctness !== "正确" ? activeCandidateCodes : [],
        diagnosisBasis: kind === "attempt" && correctness !== "正确" ? diagnosisBasis : undefined,
      });
      const signature = JSON.stringify({ ...payload, id: "" });
      if (previousPayload.current && previousPayload.current !== signature) {
        token.current = crypto.randomUUID();
      }
      previousPayload.current = signature;
      payload.id = token.current;
      const r = await fetch(`/api/students/${studentId}/learning`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await r.json()) as {
        error: string;
        events: LearningEvent[];
        relations: Relation[];
      };
      if (!r.ok) throw new Error(data.error);
      token.current = crypto.randomUUID();
      setNotes("");
      if (kind === "attempt") {
        setResponseText("");
        setAiHypothesis("");
        setEvidenceExcerpt("");
        setCandidateCodes([]);
        setDiagnosisBasis("");
        setTeacherDecision("未判断");
        setAt(localNow());
        if (diagnosticItemId && adoptedDiagnostic) {
          const next = adoptedDiagnostic.items.find((item) => item.id !== diagnosticItemId && !events.some((event) => event.diagnosticItemId === item.id));
          setDiagnosticItemId(next?.id || "");
          if (!next) setTargetAttemptId("");
        }
      }
      setSupersedes("");
      setMessage("已保存，历史记录已保留。");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function tags(
    options: string[],
    selected: string[],
    change: (v: string[]) => void,
  ) {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((x) => (
          <label
            key={x}
            className="flex items-center gap-1 rounded border p-2 text-xs"
          >
            <input
              type="checkbox"
              checked={selected.includes(x)}
              onChange={(e) =>
                change(
                  e.target.checked
                    ? [...selected, x]
                    : selected.filter((t) => t !== x),
                )
              }
            />
            {x}
          </label>
        ))}
      </div>
    );
  }
  const selectClass =
    "h-10 max-w-full rounded-md border border-slate-200 bg-white px-2 text-sm";
  return (
    <section className="surface-card space-y-4 p-5">
      <h2 className="font-semibold">
        {questionId ? "教学记录与相关提问" : "学习时间线与知识点分析"}
      </h2>
      <p className="text-xs text-slate-500">
        仅依据教师保存的记录；旧题未补记的提问不计入提问次数。频率不代表掌握率。
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-green-700">
          {message}
        </p>
      )}
      {adoptedDiagnostic && questionId && (
        <div className="rounded-xl border border-terracotta-200 bg-terracotta-50/50 p-4">
          <p className="font-semibold text-terracotta-950">本次诊断：{adoptedDiagnostic.value.diagnostic_goal}</p>
          <ol className="mt-2 space-y-2 text-sm leading-6 text-terracotta-900">
            {adoptedDiagnostic.items.map((item) => <li key={item.id}>
              {item.position}. {item.question}
              <span className="ml-2 text-xs">{events.some((event) => event.diagnosticItemId === item.id) ? "已有真实作答" : "待记录"}</span>
            </li>)}
          </ol>
          <label className="mt-3 block text-sm">本次记录哪一道诊断题
            <select aria-label="本次诊断题" className="ml-2 max-w-full rounded border bg-white p-2" value={diagnosticItemId} onChange={(event) => {
              const id = event.target.value;
              setDiagnosticItemId(id); setTargetAttemptId(id ? adoptedDiagnostic.sourceAttemptId : "");
              if (id) { setKind("attempt"); setAttemptStage("诊断检测"); setKnowledgePointCode(adoptedDiagnostic.knowledgePointCode); }
              setResponseText(""); setTeacherDecision("未判断"); setAt(localNow());
            }}>
              <option value="">普通作答（不关联此诊断包）</option>
              {adoptedDiagnostic.items.map((item) => <option key={item.id} value={item.id}>第 {item.position} 题 · {item.question.slice(0, 40)}</option>)}
            </select>
          </label>
          {diagnosticItemId && <details className="mt-2 text-xs"><summary>教师核验参考</summary>
            <p>{adoptedDiagnostic.items.find((item) => item.id === diagnosticItemId)?.expected_answer}</p>
            <p>{adoptedDiagnostic.items.find((item) => item.id === diagnosticItemId)?.error_signal}</p>
          </details>}
          <p className="mt-2 text-xs text-terracotta-800">诊断题是教师采用的方案；下方记录的学生作答才会成为学习证据。</p>
        </div>
      )}
      {!questionId && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setTab("timeline")}>
              学习时间线
            </Button>
            <Button variant="outline" onClick={() => setTab("analysis")}>
              知识点分析
            </Button>
            <Button variant="outline" onClick={() => setTab("profile")}>
              动态学习画像
            </Button>
            <Button variant="outline" onClick={() => setTab("agent")}>
              智能体建议
            </Button>
            <a
              className="rounded border px-3 py-2 text-sm"
              href={`/api/students/${studentId}/export?from=${from}&to=${to}`}
            >
              导出 Excel（当前日期范围）
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <label>
              起始日期
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              截止日期
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <select
              aria-label="章节"
              className={selectClass}
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
            >
              <option value="">全部章节</option>
              {[
                ...new Map(
                  questions.map((q) => [q.chapterCode, q.chapterName]),
                ).entries(),
              ].map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="知识点"
              className={selectClass}
              value={point}
              onChange={(e) => setPoint(e.target.value)}
            >
              <option value="">全部知识点</option>
              {[
                ...new Map(
                  questions.flatMap((q) =>
                    q.knowledgePoints.map((k) => [k.code, k.name] as const),
                  ),
                ).entries(),
              ].map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm">
            所选题目累计：{stats.questions} 道题 · {stats.inquiries} 次提问 ·{" "}
            {stats.repeats} 次重复提问 · {stats.pending} 项待复查 ·{" "}
            {stats.completed} 项已完成复查
          </p>
          <p className="text-xs text-slate-500">
            时间范围内：{visible.filter((e) => e.kind === "inquiry").length}{" "}
            次提问，{visible.filter((e) => e.kind === "result").length}{" "}
            次完成复查。待复查按当前状态计算。
          </p>
        </>
      )}
      {questionId && (
        <details open className="rounded-xl border p-3">
          <summary className="cursor-pointer font-medium">
            新增提问 / 作答证据 / 教学 / 复查
          </summary>
          <div className="mt-3 grid gap-3">
            <select
              aria-label="活动类型"
              className={selectClass}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as LearningInput["kind"]);
                token.current = crypto.randomUUID();
              }}
            >
              {Object.entries(labels).map(([key, label]) => (
                <option
                  key={key}
                  value={key}
                  disabled={key === "attempt" && !supportsAttempt}
                >
                  {label}
                  {key === "attempt" && !supportsAttempt ? "（此题暂无可记录的知识点）" : ""}
                </option>
              ))}
            </select>
            <label className="text-sm">
              发生时间
              <Input
                type="datetime-local"
                step="1"
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            </label>
            {["attempt", "teaching", "review", "result"].includes(kind) && (
              <select
                aria-label="关联提问"
                className={selectClass}
                value={activeInquiry}
                onChange={(e) => {
                  setInquiry(e.target.value);
                  setReview("");
                }}
              >
                <option value="">请选择提问</option>
                {asks.map((a, i) => (
                  <option key={a.id} value={a.id}>
                    第 {i + 1} 次提问 ·{" "}
                    {new Date(a.occurredAt).toLocaleString("zh-CN")}
                  </option>
                ))}
              </select>
            )}
            {kind === "attempt" && (
              <div className="grid gap-3 rounded-xl border border-terracotta-100 bg-terracotta-50/40 p-3">
                <div>
                  <p className="font-medium">快速记录作答结果</p>
                  <p className="text-xs text-slate-500">
                    只记录看得到的事实即可。没有草稿时无需判断错因，系统会安排最少量诊断题。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="本次作答对应知识点"
                    className={selectClass}
                    value={activeKnowledgePointCode}
                    disabled={!!diagnosticItemId}
                    onChange={(event) => {
                      const nextCode = event.target.value;
                      const patterns = errorPatternsForKnowledgePoint(nextCode);
                      setKnowledgePointCode(nextCode);
                      setTargetAttemptId("");
                      setErrorCode(patterns[0]?.code || "");
                      setCandidateCodes([]);
                    }}
                  >
                    {quickAttemptPoints.map((item) => (
                      <option key={item.code} value={item.code}>{item.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label="作答阶段"
                    className={selectClass}
                    value={attemptStage}
                    disabled={!!diagnosticItemId}
                    onChange={(event) => { setAttemptStage(event.target.value as (typeof attemptStages)[number]); setTargetAttemptId(""); }}
                  >
                    {attemptStages.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <select
                    aria-label="证据等级"
                    className={selectClass}
                    value={evidenceLevel}
                    onChange={(event) => setEvidenceLevel(event.target.value as (typeof evidenceLevels)[number])}
                  >
                    {evidenceLevels.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <select
                    aria-label="证据来源"
                    className={selectClass}
                    value={evidenceSource}
                    onChange={(event) => setEvidenceSource(event.target.value as (typeof evidenceSources)[number])}
                  >
                    {evidenceSources.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                {attemptStage !== "首次作答" && <label className="grid gap-1 text-xs">
                  本次检查要验证哪条原始作答
                  <select aria-label="要验证的原始作答" className={selectClass} value={targetAttemptId} disabled={!!diagnosticItemId} onChange={(event) => setTargetAttemptId(event.target.value)}>
                    <option value="">未指定（只保存事实，不用于判断原错因改善）</option>
                    {events.filter((event) => event.kind === "attempt" && event.correctness !== "正确" && event.knowledgePointCode === activeKnowledgePointCode).map((event) => (
                      <option key={event.id} value={event.id}>题目 #{event.questionId} · {new Date(event.occurredAt).toLocaleString("zh-CN")} · {event.responseText?.slice(0, 35)}</option>
                    ))}
                  </select>
                </label>}
                <Textarea
                  aria-label="学生原始作答"
                  placeholder={evidenceLevel === "仅有最终答案" ? "录入答题卡上的最终答案或所选选项" : "忠实录入看得到的步骤，不要补写或猜测"}
                  value={responseText}
                  onChange={(event) => setResponseText(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="作答结果"
                    className={selectClass}
                    value={correctness}
                    onChange={(event) => setCorrectness(event.target.value as (typeof correctnessOptions)[number])}
                  >
                    {correctnessOptions.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <select
                    aria-label="完成方式"
                    className={selectClass}
                    value={supportLevel}
                    onChange={(event) => setSupportLevel(event.target.value as (typeof supportLevels)[number])}
                  >
                    {supportLevels.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                {correctness !== "正确" && (
                  <details className="rounded-lg border bg-white p-3">
                    <summary className="cursor-pointer text-sm font-medium">可选：补充错因线索</summary>
                    <div className="mt-3 grid gap-3">
                      <p className="text-xs text-slate-500">
                        不确定时保持“未判断”即可；候选错因不会直接成为学生画像结论。
                      </p>
                      <Textarea
                        aria-label="AI候选错因"
                        placeholder="AI候选错因（可选，仅作为待验证假设）"
                        value={aiHypothesis}
                        onChange={(event) => setAiHypothesis(event.target.value)}
                      />
                      <p className="text-xs font-medium">候选错误模式（可多选、可不选）</p>
                      <div className="flex flex-wrap gap-2">
                        {activeErrorPatterns.map((item) => (
                          <label key={item.code} className="flex items-center gap-1 rounded border p-2 text-xs">
                            <input
                              type="checkbox"
                              checked={activeCandidateCodes.includes(item.code)}
                              onChange={(event) => setCandidateCodes(
                                event.target.checked
                                  ? [...activeCandidateCodes, item.code]
                                  : activeCandidateCodes.filter((code) => code !== item.code),
                              )}
                            />
                            {item.label}
                          </label>
                        ))}
                      </div>
                      {activeCandidateCodes.length > 0 && (
                        <p className="text-xs text-slate-500">
                          已选：{activeCandidateCodes.map((code) => errorPatternByCode(code)?.label).filter(Boolean).join("、")}
                        </p>
                      )}
                      <Input
                        aria-label="诊断依据"
                        placeholder="候选依据，例如：错误选项对应预设干扰项（选填）"
                        value={diagnosisBasis}
                        onChange={(event) => setDiagnosisBasis(event.target.value)}
                      />
                      <select
                        aria-label="教师证据判断"
                        className={selectClass}
                        value={teacherDecision}
                        onChange={(event) => setTeacherDecision(event.target.value as (typeof evidenceDecisions)[number])}
                      >
                        {evidenceDecisions.map((item) => <option key={item}>{item}</option>)}
                      </select>
                      {["教师确认", "教师修正"].includes(teacherDecision) && (
                        <select
                          aria-label="具体错误模式"
                          className={selectClass}
                          value={activeErrorCode}
                          onChange={(event) => setErrorCode(event.target.value)}
                        >
                          {activeErrorPatterns.map((item) => (
                            <option key={item.code} value={item.code}>{item.label}</option>
                          ))}
                        </select>
                      )}
                      <Input
                        aria-label="作答证据片段"
                        placeholder="看得到的证据片段（选填），不要补写学生未展示的步骤"
                        value={evidenceExcerpt}
                        onChange={(event) => setEvidenceExcerpt(event.target.value)}
                      />
                    </div>
                  </details>
                )}
              </div>
            )}
            {["inquiry", "teaching"].includes(kind) && (
              <>
                <p className="text-sm">提问原因（由教师确认）</p>
                {tags(reasons, reasonTags, setReasons)}
                <Input
                  placeholder="自定义原因，逗号分隔"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                />
              </>
            )}
            {kind === "teaching" && (
              <>
                <p className="text-sm">教学方法</p>
                {tags(methods, methodTags, setMethods)}
                <Input
                  placeholder="自定义方法，逗号分隔"
                  value={customMethod}
                  onChange={(e) => setCustomMethod(e.target.value)}
                />
              </>
            )}
            {["teaching", "result"].includes(kind) && (
              <select
                aria-label="教师记录的表现"
                className={selectClass}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                {outcomes.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            )}
            {kind === "review" && (
              <label className="text-sm">
                下次复查时间
                <Input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
            )}
            {kind === "result" && (
              <select
                aria-label="待完成的复查"
                className={selectClass}
                value={reviewId}
                onChange={(e) => setReview(e.target.value)}
              >
                <option value="">选择待复查安排</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {new Date(p.dueAt!).toLocaleString("zh-CN")}
                  </option>
                ))}
              </select>
            )}
            {kind === "relation" && (
              <>
                <select
                  aria-label="相关题目"
                  className={selectClass}
                  value={relatedId}
                  onChange={(e) => setRelated(e.target.value)}
                >
                  <option value="">选择其他题目</option>
                  {questions
                    .filter((q) => q.id !== questionId)
                    .map((q) => (
                      <option key={q.id} value={q.id}>
                        #{q.id} {q.chapterName}
                      </option>
                    ))}
                </select>
                <select
                  aria-label="关联类型"
                  className={selectClass}
                  value={relationKind}
                  onChange={(e) => setRelationKind(e.target.value)}
                >
                  {["同类题", "变式题", "相似错误原因"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </>
            )}
            {!["review", "relation"].includes(kind) && (
              <Textarea
              aria-label="教师备注"
              placeholder="教师反馈、提问背景或讲解备注（选填）"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              />
            )}
            {supersedes && (
              <p className="text-xs">正在追加修订；原记录仍会保留。</p>
            )}
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "正在保存…" : "保存学习记录"}
            </Button>
          </div>
        </details>
      )}
      {tab === "agent" && !questionId ? (
        <TeachingAgentPanel studentId={studentId} questions={questions} events={events} onOpen={onOpen} onRecorded={load} />
      ) : tab === "profile" && !questionId ? (
        <div className="space-y-3">
          {!profiles.length && !diagnosticQueue.length && (
            <div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">
              暂无作答证据。请先在已完成知识点分类的题目中快速记录一次作答结果。
            </div>
          )}
          {diagnosticQueue.map((item) => (
            <article key={item.attemptId} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>待诊断线索 · 题目 #{item.questionId}</b>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-amber-800">{item.status}</span>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {item.evidenceSource} · {item.evidenceLevel} · {new Date(item.occurredAt).toLocaleDateString("zh-CN")}
              </p>
              {item.candidateLabels.length > 0 && (
                <p className="mt-2"><b>候选错因：</b>{item.candidateLabels.join("、")}（尚未确认）</p>
              )}
              {!["已补证", "未发现持续性证据"].includes(item.status) && (
                <div className="mt-3">
                  <b>建议先做两道最小诊断：</b>
                  <ol className="ml-5 mt-1 list-decimal">
                    {item.questions.map((question) => <li key={question}>{question}</li>)}
                  </ol>
                </div>
              )}
              <button type="button" className="mt-3 text-xs font-medium text-terracotta-600" onClick={() => onOpen(item.questionId)}>
                查看这条作答记录
              </button>
              <EvidenceTrail studentId={studentId} evidence={item.evidence} events={events} />
            </article>
          ))}
          {profiles.map((profile) => (
            <article key={`${profile.knowledgePointCode}-${profile.errorCode}`} className="rounded-xl border p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{profile.errorLabel}</b>
                <span className="rounded-full bg-terracotta-50 px-2 py-1 text-xs font-medium text-terracotta-700">{profile.status}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {profile.evidenceCount} 条教师确认的真实作答证据 · 最近记录 {new Date(profile.latestAt).toLocaleDateString("zh-CN")}
              </p>
              <p className="mt-3"><b>建议干预：</b>{profile.intervention}</p>
              <p className="mt-2"><b>后续检测：</b>{profile.check}</p>
              {profile.uncertainties.length > 0 && <ul className="mt-3 space-y-1 text-xs text-amber-800">{profile.uncertainties.map((item) => <li key={item}>待补证：{item}</li>)}</ul>}
              <EvidenceTrail studentId={studentId} evidence={profile.evidence} events={events} />
              <button type="button" className="mt-3 text-xs font-medium text-terracotta-600" onClick={() => onOpen(profile.latestQuestionId)}>
                查看最近一条原始证据
              </button>
            </article>
          ))}
          <p className="text-xs text-slate-500">
            画像状态由教师确认的错因、后续独立作答和间隔复查共同更新，不代表自动计算的掌握率。
          </p>
        </div>
      ) : tab === "analysis" && !questionId ? (
        <div className="space-y-3">
          {scopedQuestions.length === 0 && <p>暂无匹配题目。</p>}
          {[
            ...new Map(
              scopedQuestions.flatMap((q) =>
                q.knowledgePoints.map((k) => [k.code, k.name] as const),
              ),
            ).entries(),
          ].map(([code, name]) => {
            const ids = scopedQuestions
              .filter((q) => q.knowledgePoints.some((k) => k.code === code))
              .map((q) => q.id);
            const s = learningStats(ids, events);
            const rows = visible.filter((e) => ids.includes(e.questionId));
            return (
              <div key={code} className="rounded border p-3 text-sm">
                <b>{name}</b>
                <p>
                  {s.questions} 道题 / {s.inquiries} 次提问 / 重复 {s.repeats}{" "}
                  次 / 待复查 {s.pending} / 已复查 {s.completed}
                </p>
                <p>
                  范围内教师记录的原因：
                  {rows.flatMap((e) => e.reasons || []).join("、") || "未记录"}
                </p>
                <p>
                  范围内独立完成或复查通过记录：
                  {
                    rows.filter((e) =>
                      ["能够独立完成", "复查通过"].includes(e.outcome || ""),
                    ).length
                  }{" "}
                  条（来源：教师记录，并非掌握率）
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="max-h-[32rem] space-y-3 overflow-y-auto">
          {!visible.length && (
            <p className="text-sm text-slate-500">
              暂无学习活动。旧题可从新增提问开始补记真实情况。
            </p>
          )}
          {[...visible].reverse().map((e) => (
            <article key={e.id} id={`learning-event-${e.id}`} className="scroll-mt-6 rounded-lg border p-3 text-sm">
              <button
                type="button"
                className="font-medium text-terracotta-700"
                onClick={() => onOpen(e.questionId)}
              >
                #{e.questionId} · {e.kind === "inquiry" ? (events.find(item => item.kind === "inquiry" && item.questionId === e.questionId)?.id === e.id ? "首次提问" : "再次提问") : labels[e.kind]} ·{" "}
                {questions
                  .find((q) => q.id === e.questionId)
                  ?.knowledgePoints.map((k) => k.name)
                  .join("、")}
              </button>
              <p className="text-xs text-slate-500">
                {new Date(e.occurredAt).toLocaleString("zh-CN")}
                {e.inquiryId && ` · 提问 ${e.inquiryId.slice(0, 8)}`}
              </p>
              {e.kind === "attempt" && (
                <div className="my-2 rounded-lg bg-slate-50 p-3">
                  <p><b>{e.attemptStage}</b> · {e.correctness} · {e.supportLevel}</p>
                  <p className="mt-1 text-xs text-slate-500">{e.evidenceSource} · {e.evidenceLevel}</p>
                  <p className="mt-1 whitespace-pre-wrap"><b>已记录作答：</b>{e.responseText}</p>
                  {e.diagnosticItemId && <p className="mt-1"><b>对应诊断题 {e.diagnosticPosition}：</b>{e.diagnosticQuestion}</p>}
                  {e.interventionPlanId && <p className="mt-1"><b>本轮干预检测题：</b>{e.checkQuestion}</p>}
                  {e.targetAttemptId && <p className="mt-1 text-xs text-terracotta-700">验证目标：<a className="underline" href={`/students/${studentId}/questions/${events.find((item) => item.id === e.targetAttemptId)?.questionId || e.questionId}#learning-event-${e.targetAttemptId}`}>查看原始作答</a></p>}
                  {e.diagnosisStatus && <p className="mt-1"><b>错因状态：</b>{e.diagnosisStatus}</p>}
                  {e.teacherDecision && e.teacherDecision !== "未判断" && <p className="mt-1"><b>教师判断：</b>{e.teacherDecision}{e.errorLabel ? ` · ${e.errorLabel}` : ""}</p>}
                  {e.aiHypothesis && <p className="mt-1 text-slate-600"><b>AI候选：</b>{e.aiHypothesis}</p>}
                  {(e.candidateErrorCodes?.length || 0) > 0 && <p className="mt-1 text-slate-600"><b>候选模式：</b>{e.candidateErrorCodes?.map((code) => errorPatternByCode(code)?.label).filter(Boolean).join("、")}（待验证）</p>}
                  {e.diagnosisBasis && <p className="mt-1 text-slate-600"><b>候选依据：</b>{e.diagnosisBasis}</p>}
                  {e.evidenceExcerpt && <p className="mt-1 text-slate-600"><b>证据片段：</b>{e.evidenceExcerpt}</p>}
                </div>
              )}
              <p>
                {[...(e.reasons || []), ...(e.methods || []), e.outcome]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {e.dueAt && (
                <p>
                  复查日期：{new Date(e.dueAt).toLocaleString("zh-CN")} ·{" "}
                  {events.some((c) => c.reviewId === e.id)
                    ? "已完成"
                    : "待复查"}
                </p>
              )}
              <p className="whitespace-pre-wrap">{e.notes}</p>
              {e.supersedesId && <p>修订此前记录（保留原文）</p>}
              {questionId && e.kind === "teaching" && (
                <button
                  type="button"
                  className="text-xs text-terracotta-600"
                  onClick={() => {
                    setKind("teaching");
                    setInquiry(e.inquiryId!);
                    setSupersedes(e.id);
                    setMethods(e.methods || []);
                    setReasons(e.reasons || []);
                    setOutcome(e.outcome!);
                    setNotes(e.notes);
                    setAt(localNow());
                  }}
                >
                  追加修订
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {questionId && (
        <details>
          <summary>相关提问与相似题目</summary>
          {relations
            .filter(
              (r) =>
                r.question_id === questionId || r.related_id === questionId,
            )
            .map((r) => {
              const other =
                r.question_id === questionId ? r.related_id : r.question_id;
              return (
                <Button
                  key={r.id}
                  variant="outline"
                  onClick={() => onOpen(other)}
                >
                  #{other} · {r.kind}
                </Button>
              );
            })}
          <p className="mt-2 text-xs text-slate-500">
            同题提问见上方历史；不同题需教师手动关联。
          </p>
        </details>
      )}
    </section>
  );
}


import { getD1Binding } from "@/db";
import {
  errorPatternsForKnowledgePoint,
  learningInput,
  supportsQuickAttempt,
  type LearningEvent,
} from "@/lib/learning";
import { isMethodCode } from "@/lib/taxonomy";

export async function readLearning(studentId: number) {
  const db = getD1Binding();
  const scope =
    "q.student_id = ? AND q.deleted_at IS NULL AND EXISTS (SELECT 1 FROM students s WHERE s.id=q.student_id AND s.deleted_at IS NULL)";
  const [asked, taught, planned, completed, related, attempted] = await db.batch<
    Record<string, unknown>
  >([
    db
      .prepare(
        `SELECT i.*, q.id AS questionId FROM inquiries i JOIN questions q ON q.id=i.question_id WHERE ${scope}`,
      )
      .bind(studentId),
    db
      .prepare(
        `SELECT t.*, i.question_id AS questionId FROM teaching_records t JOIN inquiries i ON i.id=t.inquiry_id JOIN questions q ON q.id=i.question_id WHERE ${scope}`,
      )
      .bind(studentId),
    db
      .prepare(
        `SELECT r.*, i.question_id AS questionId FROM reviews r JOIN inquiries i ON i.id=r.inquiry_id JOIN questions q ON q.id=i.question_id WHERE ${scope}`,
      )
      .bind(studentId),
    db
      .prepare(
        `SELECT c.*, r.inquiry_id, i.question_id AS questionId FROM review_results c JOIN reviews r ON r.id=c.review_id JOIN inquiries i ON i.id=r.inquiry_id JOIN questions q ON q.id=i.question_id WHERE ${scope}`,
      )
      .bind(studentId),
    db
      .prepare(
        `SELECT r.* FROM question_relations r JOIN questions q ON q.id=r.question_id JOIN questions other ON other.id=r.related_id AND other.student_id=q.student_id AND other.deleted_at IS NULL WHERE ${scope}`,
      )
      .bind(studentId),
    db
      .prepare(
        `SELECT a.*, d.plan_id AS diagnostic_plan_id, d.position AS diagnostic_position, d.content AS diagnostic_content,
         e.knowledge_point_code AS evidence_knowledge_point_code, e.ai_hypothesis, e.teacher_decision, e.error_code, e.error_label, e.evidence_excerpt, e.diagnosis_status, e.candidate_error_codes, e.diagnosis_basis
         FROM student_attempts a
         LEFT JOIN error_evidence e ON e.attempt_id=a.id
         LEFT JOIN diagnostic_items d ON d.id=a.diagnostic_item_id
         JOIN questions q ON q.id=a.question_id
         WHERE ${scope}`,
      )
      .bind(studentId),
  ]);
  const events: LearningEvent[] = [
    ...asked.results.map((r) => ({
      id: String(r.id),
      questionId: Number(r.questionId),
      kind: "inquiry",
      occurredAt: String(r.occurred_at),
      notes: String(r.notes),
      reasons: JSON.parse(String(r.reasons)),
    })),
    ...taught.results.map((r) => ({
      id: String(r.id),
      questionId: Number(r.questionId),
      inquiryId: String(r.inquiry_id),
      kind: "teaching",
      occurredAt: String(r.occurred_at),
      notes: String(r.notes),
      reasons: JSON.parse(String(r.reasons)),
      methods: JSON.parse(String(r.methods)),
      outcome: String(r.outcome),
      supersedesId: r.supersedes_id ? String(r.supersedes_id) : undefined,
    })),
    ...planned.results.map((r) => ({
      id: String(r.id),
      questionId: Number(r.questionId),
      inquiryId: String(r.inquiry_id),
      kind: "review",
      occurredAt: String(r.created_at),
      notes: "",
      dueAt: String(r.due_at),
    })),
    ...completed.results.map((r) => ({
      id: String(r.id),
      questionId: Number(r.questionId),
      inquiryId: String(r.inquiry_id),
      reviewId: String(r.review_id),
      kind: "result",
      occurredAt: String(r.occurred_at),
      notes: String(r.notes),
      outcome: String(r.outcome),
    })),
    ...attempted.results.map((r) => ({
      id: String(r.id),
      questionId: Number(r.question_id),
      inquiryId: r.inquiry_id ? String(r.inquiry_id) : undefined,
      targetAttemptId: r.target_attempt_id ? String(r.target_attempt_id) : undefined,
      interventionPlanId: r.intervention_plan_id ? String(r.intervention_plan_id) : undefined,
      checkQuestion: r.check_question ? String(r.check_question) : undefined,
      diagnosticItemId: r.diagnostic_item_id ? String(r.diagnostic_item_id) : undefined,
      diagnosticPlanId: r.diagnostic_plan_id ? String(r.diagnostic_plan_id) : undefined,
      diagnosticPosition: r.diagnostic_position ? Number(r.diagnostic_position) : undefined,
      diagnosticQuestion: r.diagnostic_content ? String(JSON.parse(String(r.diagnostic_content)).question || "") : undefined,
      kind: "attempt",
      occurredAt: String(r.occurred_at),
      notes: String(r.notes),
      attemptStage: String(r.stage) as LearningEvent["attemptStage"],
      responseText: String(r.response_text),
      correctness: String(r.correctness) as LearningEvent["correctness"],
      supportLevel: String(r.support_level) as LearningEvent["supportLevel"],
      evidenceLevel: String(r.evidence_level) as LearningEvent["evidenceLevel"],
      evidenceSource: String(r.evidence_source) as LearningEvent["evidenceSource"],
      knowledgePointCode: r.knowledge_point_code
        ? String(r.knowledge_point_code)
        : undefined,
      aiHypothesis: r.ai_hypothesis ? String(r.ai_hypothesis) : undefined,
      teacherDecision: r.teacher_decision
        ? (String(r.teacher_decision) as LearningEvent["teacherDecision"])
        : undefined,
      errorCode: r.error_code ? String(r.error_code) : undefined,
      errorLabel: r.error_label ? String(r.error_label) : undefined,
      evidenceExcerpt: r.evidence_excerpt
        ? String(r.evidence_excerpt)
        : undefined,
      diagnosisStatus: r.diagnosis_status
        ? (String(r.diagnosis_status) as LearningEvent["diagnosisStatus"])
        : undefined,
      candidateErrorCodes: r.candidate_error_codes
        ? (JSON.parse(String(r.candidate_error_codes)) as string[])
        : [],
      diagnosisBasis: r.diagnosis_basis ? String(r.diagnosis_basis) : undefined,
    })),
  ];
  return {
    events: events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    relations: related.results,
  };
}
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json({ error: "学生编号无效" }, { status: 400 });
  try {
    return Response.json(await readLearning(id));
  } catch {
    return Response.json(
      { error: "学习记录加载失败，请检查数据库迁移后重试。" },
      { status: 500 },
    );
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const studentId = Number((await context.params).id);
    if (!Number.isSafeInteger(studentId) || studentId < 1)
      return Response.json({ error: "学生编号无效。" }, { status: 400 });
    const parsed = learningInput.safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        { error: "请检查记录日期、标签及结果。" },
        { status: 400 },
      );
    const p = parsed.data;
    const db = getD1Binding();
    const question = await db
      .prepare(
        "SELECT q.id FROM questions q JOIN students s ON s.id=q.student_id WHERE q.id=? AND q.student_id=? AND q.deleted_at IS NULL AND s.deleted_at IS NULL",
      )
      .bind(p.questionId, studentId)
      .first();
    if (!question)
      return Response.json(
        { error: "题目不属于当前学生或已删除。" },
        { status: 404 },
      );
    if (["attempt", "teaching", "review", "result"].includes(p.kind)) {
      const inquiry = await db
        .prepare("SELECT id FROM inquiries WHERE id=? AND question_id=?")
        .bind(p.inquiryId || "", p.questionId)
        .first();
      if (!inquiry)
        return Response.json(
          { error: "请选择此题的一次提问。" },
          { status: 400 },
        );
    }
    if (p.kind === "attempt") {
      let targetAttemptId = p.targetAttemptId || null;
      if (p.interventionPlanId) {
        const plan = await db.prepare(`SELECT p.*, a.inquiry_id FROM intervention_plans p JOIN student_attempts a ON a.id=p.source_attempt_id JOIN questions q ON q.id=p.question_id JOIN students s ON s.id=q.student_id WHERE p.id=? AND q.student_id=? AND q.deleted_at IS NULL AND s.deleted_at IS NULL`).bind(p.interventionPlanId, studentId).first<Record<string, unknown>>();
        if (!plan || Number(plan.question_id) !== p.questionId || plan.knowledge_point_code !== p.knowledgePointCode || plan.inquiry_id !== p.inquiryId || (targetAttemptId && targetAttemptId !== plan.source_attempt_id)) return Response.json({ error: "干预检查与原作答、题目或知识点不一致。" }, { status: 400 });
        if (plan.status !== "implemented" || !plan.implemented_at) return Response.json({ error: "请先记录实际干预，再记录检测。" }, { status: 409 });
        if (p.occurredAt <= String(plan.implemented_at)) return Response.json({ error: "检测时间应晚于实际干预。" }, { status: 400 });
        if (p.attemptStage === "间隔复查") {
          const post = await db.prepare("SELECT occurred_at FROM student_attempts WHERE intervention_plan_id=? AND stage='干预后检测' ORDER BY occurred_at DESC LIMIT 1").bind(p.interventionPlanId).first<Record<string, unknown>>();
          if (!post || p.occurredAt <= String(post.occurred_at) || p.occurredAt < String(plan.due_at)) return Response.json({ error: "请先完成干预后检测，间隔复查应到计划时间后进行。" }, { status: 400 });
        }
        targetAttemptId = String(plan.source_attempt_id);
      }
      if (p.diagnosticItemId) {
        const item = await db.prepare(`SELECT d.id, p.source_attempt_id, p.question_id, p.knowledge_point_code, p.status, p.decided_at
          FROM diagnostic_items d JOIN diagnostic_plans p ON p.id=d.plan_id
          JOIN questions q ON q.id=p.question_id JOIN students s ON s.id=q.student_id
          WHERE d.id=? AND q.student_id=? AND q.deleted_at IS NULL AND s.deleted_at IS NULL`)
          .bind(p.diagnosticItemId, studentId).first<Record<string, unknown>>();
        if (!item || Number(item.question_id) !== p.questionId || item.knowledge_point_code !== p.knowledgePointCode)
          return Response.json({ error: "诊断题不属于此题或此知识点。" }, { status: 400 });
        if (item.status !== "adopted")
          return Response.json({ error: "请先核对并采用诊断方案，再记录学生作答。" }, { status: 409 });
        if (item.decided_at && p.occurredAt < String(item.decided_at))
          return Response.json({ error: "诊断作答时间不能早于教师采用方案的时间。" }, { status: 400 });
        if (targetAttemptId && targetAttemptId !== item.source_attempt_id)
          return Response.json({ error: "诊断题与要验证的原始作答不一致。" }, { status: 400 });
        targetAttemptId = String(item.source_attempt_id);
      }
      if (targetAttemptId) {
        const source = await db.prepare(`SELECT a.id, a.knowledge_point_code, a.occurred_at, a.correctness
          FROM student_attempts a JOIN questions q ON q.id=a.question_id JOIN students s ON s.id=q.student_id
          WHERE a.id=? AND q.student_id=? AND q.deleted_at IS NULL AND s.deleted_at IS NULL`)
          .bind(targetAttemptId, studentId).first<Record<string, unknown>>();
        if (!source || source.knowledge_point_code !== p.knowledgePointCode || source.correctness === "正确" || targetAttemptId === p.id)
          return Response.json({ error: "请选择当前学生同知识点的一次未成功作答作为验证目标。" }, { status: 400 });
        if (p.occurredAt <= String(source.occurred_at))
          return Response.json({ error: "本次检查时间应晚于原始作答。" }, { status: 400 });
      }
      const linkedPoint = await db
        .prepare(
          `SELECT kp.code FROM question_knowledge_points qkp
           JOIN knowledge_points kp ON kp.id=qkp.knowledge_point_id
           WHERE qkp.question_id=? AND kp.code=?`,
        )
        .bind(p.questionId, p.knowledgePointCode || "")
        .first();
      const selectedCode = p.knowledgePointCode || "";
      if (!linkedPoint || isMethodCode("初中", selectedCode) || isMethodCode("高中", selectedCode) || !supportsQuickAttempt(selectedCode))
        return Response.json(
          { error: "请选择此题已确认分类中支持作答记录的知识点。" },
          { status: 400 },
        );
      const allowedPatterns = errorPatternsForKnowledgePoint(
        p.knowledgePointCode || "",
      );
      if (
        p.errorCode &&
        !allowedPatterns.some(
          (item) => item.code === p.errorCode && item.label === p.errorLabel,
        )
      )
        return Response.json(
          { error: "请选择当前知识点目录中的错误模式。" },
          { status: 400 },
        );
      const candidateCodes = [...new Set(p.candidateErrorCodes)].filter(Boolean);
      if (
        candidateCodes.some(
          (code) => !allowedPatterns.some((item) => item.code === code),
        )
      )
        return Response.json(
          { error: "候选错因不在当前知识点目录中。" },
          { status: 400 },
        );
      const teacherConfirmed = ["教师确认", "教师修正"].includes(
        p.teacherDecision || "",
      );
      const diagnosisStatus = teacherConfirmed
        ? "已支持"
        : p.teacherDecision === "教师否定"
          ? "已否定"
          : candidateCodes.length || p.aiHypothesis
            ? "待验证"
            : "错因未知";
      const existing = await db.prepare("SELECT * FROM student_attempts WHERE id=?").bind(p.id).first<Record<string, unknown>>();
      if (existing) {
        const expected: Record<string, unknown> = {
          question_id: p.questionId, inquiry_id: p.inquiryId, occurred_at: p.occurredAt,
          stage: p.attemptStage, knowledge_point_code: p.knowledgePointCode, evidence_level: p.evidenceLevel,
          evidence_source: p.evidenceSource, response_text: p.responseText, correctness: p.correctness,
          support_level: p.supportLevel, notes: p.notes, diagnostic_item_id: p.diagnosticItemId || null,
          target_attempt_id: targetAttemptId,
          intervention_plan_id: p.interventionPlanId || null, check_question: p.checkQuestion,
        };
        const evidence = await db.prepare("SELECT * FROM error_evidence WHERE attempt_id=?").bind(p.id).first<Record<string, unknown>>();
        const expectedEvidence: Record<string, unknown> = {
          ai_hypothesis: p.aiHypothesis || null, teacher_decision: p.teacherDecision || "未判断",
          error_code: p.errorCode || null, error_label: p.errorLabel || null,
          evidence_excerpt: p.evidenceExcerpt || "", candidate_error_codes: JSON.stringify(candidateCodes),
          diagnosis_basis: p.diagnosisBasis || "",
        };
        if (Object.entries(expected).some(([key, value]) => existing[key] !== value)
          || (p.correctness !== "正确" && (!evidence || Object.entries(expectedEvidence).some(([key, value]) => evidence[key] !== value))))
          return Response.json({ error: "此提交编号已保存不同的作答，请刷新后新增记录。" }, { status: 409 });
        return Response.json({ ok: true });
      }
      const statements = [
        db
          .prepare(
            `INSERT INTO student_attempts
             (id,question_id,inquiry_id,occurred_at,stage,knowledge_point_code,evidence_level,evidence_source,response_text,correctness,support_level,notes,diagnostic_item_id,target_attempt_id,intervention_plan_id,check_question)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
          )
          .bind(
            p.id,
            p.questionId,
            p.inquiryId!,
            p.occurredAt,
            p.attemptStage!,
            p.knowledgePointCode!,
            p.evidenceLevel!,
            p.evidenceSource!,
            p.responseText!,
            p.correctness!,
            p.supportLevel!,
            p.notes,
            p.diagnosticItemId || null,
            targetAttemptId,
            p.interventionPlanId || null,
            p.checkQuestion,
          ),
      ];
      if (p.correctness !== "正确")
        statements.push(
          db
            .prepare(
              `INSERT INTO error_evidence
               (id,attempt_id,knowledge_point_code,ai_hypothesis,teacher_decision,error_code,error_label,evidence_excerpt,diagnosis_status,candidate_error_codes,diagnosis_basis,notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
            )
            .bind(
              p.id,
              p.id,
              p.knowledgePointCode!,
              p.aiHypothesis || null,
              p.teacherDecision || "未判断",
              p.errorCode || null,
              p.errorLabel || null,
              p.evidenceExcerpt || "",
              diagnosisStatus,
              JSON.stringify(candidateCodes),
              p.diagnosisBasis || "",
              p.notes,
            ),
        );
      await db.batch(statements);
      return Response.json({ ok: true });
    }
    let statement: D1PreparedStatement;
    if (p.kind === "inquiry")
      statement = db
        .prepare(
          "INSERT INTO inquiries (id,question_id,occurred_at,reasons,notes) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          p.id,
          p.questionId,
          p.occurredAt,
          JSON.stringify(p.reasons),
          p.notes,
        );
    else if (p.kind === "teaching") {
      if (
        p.supersedesId &&
        !(await db
          .prepare(
            "SELECT id FROM teaching_records WHERE id=? AND inquiry_id=?",
          )
          .bind(p.supersedesId, p.inquiryId!)
          .first())
      )
        return Response.json(
          { error: "被修订记录不属于该次提问。" },
          { status: 400 },
        );
      statement = db
        .prepare(
          "INSERT INTO teaching_records (id,inquiry_id,occurred_at,methods,outcome,notes,supersedes_id,reasons) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          p.id,
          p.inquiryId!,
          p.occurredAt,
          JSON.stringify(p.methods),
          p.outcome,
          p.notes,
          p.supersedesId || null,
          JSON.stringify(p.reasons),
        );
    } else if (p.kind === "review") {
      if (!p.dueAt)
        return Response.json({ error: "请选择复查日期。" }, { status: 400 });
      statement = db
        .prepare(
          "INSERT INTO reviews (id,inquiry_id,created_at,due_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(p.id, p.inquiryId!, p.occurredAt, p.dueAt);
    } else if (p.kind === "result") {
      if (
        !p.reviewId ||
        !(await db
          .prepare("SELECT id FROM reviews WHERE id=? AND inquiry_id=?")
          .bind(p.reviewId, p.inquiryId!)
          .first())
      )
        return Response.json({ error: "复查安排无效。" }, { status: 400 });
      const existing = await db
        .prepare("SELECT id FROM review_results WHERE review_id=?")
        .bind(p.reviewId)
        .first<{ id: string }>();
      if (existing && existing.id !== p.id)
        return Response.json(
          { error: "该复查已完成，请刷新查看；再次复查请新增安排。" },
          { status: 409 },
        );
      statement = db
        .prepare(
          "INSERT INTO review_results (id,review_id,occurred_at,outcome,notes) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(p.id, p.reviewId, p.occurredAt, p.outcome, p.notes);
    } else {
      if (
        !p.relatedId ||
        p.relatedId === p.questionId ||
        !p.relationKind ||
        !(await db
          .prepare(
            "SELECT id FROM questions WHERE id=? AND student_id=? AND deleted_at IS NULL",
          )
          .bind(p.relatedId, studentId)
          .first())
      )
        return Response.json(
          { error: "请选择当前学生的另一道题。" },
          { status: 400 },
        );
      statement = db
        .prepare(
          "INSERT INTO question_relations (id,question_id,related_id,kind) VALUES (?,?,?,?) ON CONFLICT DO NOTHING",
        )
        .bind(
          p.id,
          Math.min(p.questionId, p.relatedId),
          Math.max(p.questionId, p.relatedId),
          p.relationKind,
        );
    }
    await statement.run();
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "保存失败，请刷新后重试；已有历史记录未被覆盖。" },
      { status: 500 },
    );
  }
}

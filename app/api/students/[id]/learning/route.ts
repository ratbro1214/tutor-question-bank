import { getD1Binding } from "@/db";
import {
  formulaErrorPatterns,
  learningInput,
  pilotKnowledgePointCode,
  type LearningEvent,
} from "@/lib/learning";

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
        `SELECT a.*, e.knowledge_point_code AS evidence_knowledge_point_code, e.ai_hypothesis, e.teacher_decision, e.error_code, e.error_label, e.evidence_excerpt, e.diagnosis_status, e.candidate_error_codes, e.diagnosis_basis
         FROM student_attempts a
         LEFT JOIN error_evidence e ON e.attempt_id=a.id
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
      const linkedPoint = await db
        .prepare(
          `SELECT kp.code FROM question_knowledge_points qkp
           JOIN knowledge_points kp ON kp.id=qkp.knowledge_point_id
           WHERE qkp.question_id=? AND kp.code=?`,
        )
        .bind(p.questionId, p.knowledgePointCode || "")
        .first();
      if (!linkedPoint || p.knowledgePointCode !== pilotKnowledgePointCode)
        return Response.json(
          { error: "当前试点仅支持已标注为“乘法公式”的题目。" },
          { status: 400 },
        );
      if (
        p.errorCode &&
        !formulaErrorPatterns.some(
          (item) => item.code === p.errorCode && item.label === p.errorLabel,
        )
      )
        return Response.json(
          { error: "请选择试点目录中的错误模式。" },
          { status: 400 },
        );
      const candidateCodes = [...new Set(p.candidateErrorCodes)].filter(Boolean);
      if (
        candidateCodes.some(
          (code) => !formulaErrorPatterns.some((item) => item.code === code),
        )
      )
        return Response.json(
          { error: "候选错因不在当前试点目录中。" },
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
      const statements = [
        db
          .prepare(
            `INSERT INTO student_attempts
             (id,question_id,inquiry_id,occurred_at,stage,knowledge_point_code,evidence_level,evidence_source,response_text,correctness,support_level,notes)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
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

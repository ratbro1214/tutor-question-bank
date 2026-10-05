import { getD1Binding } from "@/db";
import { interventionInput, interventionDecision, type InterventionPlan } from "@/lib/interventions";
const scope = "q.student_id=? AND q.deleted_at IS NULL AND s.deleted_at IS NULL";
export async function readInterventions(studentId: number): Promise<InterventionPlan[]> {
  const rows = await getD1Binding().prepare(`SELECT p.* FROM intervention_plans p JOIN questions q ON q.id=p.question_id JOIN students s ON s.id=q.student_id WHERE ${scope} ORDER BY p.created_at DESC`).bind(studentId).all<Record<string, unknown>>();
  return rows.results.map((r) => ({ id: String(r.id), questionId: Number(r.question_id), sourceAttemptId: String(r.source_attempt_id), knowledgePointCode: String(r.knowledge_point_code), goal: String(r.goal), strategy: String(r.strategy), checkInstruction: String(r.check_instruction), dueAt: String(r.due_at), createdAt: String(r.created_at), status: String(r.status), teachingRecordId: r.teaching_record_id ? String(r.teaching_record_id) : null, implementedAt: r.implemented_at ? String(r.implemented_at) : null }));
}
type Context = { params: Promise<{ id: string }> };
async function studentId(context: Context) { return Number((await context.params).id); }
const validId = (id: number) => Number.isSafeInteger(id) && id > 0;
export async function GET(_request: Request, context: Context) {
  const id = await studentId(context);
  if (!validId(id)) return Response.json({ error: "学生编号无效。" }, { status: 400 });
  try { return Response.json({ plans: await readInterventions(id) }); } catch { return Response.json({ error: "干预计划加载失败，请检查数据库迁移。" }, { status: 500 }); }
}
export async function POST(request: Request, context: Context) {
  const id = await studentId(context);
  const parsed = interventionInput.safeParse(await request.json().catch(() => null));
  if (!validId(id) || !parsed.success) return Response.json({ error: "请完整填写干预目标、方法与复查时间。" }, { status: 400 });
  try {
    const db = getD1Binding(), p = parsed.data;
    const source = await db.prepare(`SELECT a.*, e.teacher_decision, e.error_code FROM student_attempts a JOIN error_evidence e ON e.attempt_id=a.id JOIN questions q ON q.id=a.question_id JOIN students s ON s.id=q.student_id WHERE a.id=? AND ${scope}`).bind(p.sourceAttemptId, id).first<Record<string, unknown>>();
    if (!source || !source.inquiry_id || source.correctness === "正确" || !source.error_code || !["教师确认", "教师修正"].includes(String(source.teacher_decision))) return Response.json({ error: "请基于当前学生教师确认的具体错因建立干预。" }, { status: 400 });
    const existing = await db.prepare("SELECT * FROM intervention_plans WHERE id=?").bind(p.id).first<Record<string, unknown>>();
    if (existing) {
      if (existing.source_attempt_id !== p.sourceAttemptId || existing.goal !== p.goal || existing.strategy !== p.strategy || existing.check_instruction !== p.checkInstruction || existing.due_at !== p.dueAt) return Response.json({ error: "提交编号已保存不同方案。" }, { status: 409 });
      return Response.json({ ok: true });
    }
    const createdAt = new Date().toISOString();
    if (p.dueAt <= createdAt || p.dueAt <= String(source.occurred_at)) return Response.json({ error: "间隔复查时间应晚于当前时间和原作答。" }, { status: 400 });
    await db.prepare("INSERT INTO intervention_plans(id,question_id,source_attempt_id,knowledge_point_code,goal,strategy,check_instruction,due_at,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,'planned')").bind(p.id, source.question_id, p.sourceAttemptId, source.knowledge_point_code, p.goal, p.strategy, p.checkInstruction, p.dueAt, createdAt).run();
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "干预计划保存失败。" }, { status: 500 }); }
}
export async function PATCH(request: Request, context: Context) {
  const id = await studentId(context);
  const parsed = interventionDecision.safeParse(await request.json().catch(() => null));
  if (!validId(id) || !parsed.success) return Response.json({ error: "干预操作无效，请填写实际实施记录。" }, { status: 400 });
  try {
    const db = getD1Binding(), p = parsed.data;
    const row = await db.prepare(`SELECT p.*, a.inquiry_id, a.occurred_at AS source_at FROM intervention_plans p JOIN student_attempts a ON a.id=p.source_attempt_id JOIN questions q ON q.id=p.question_id JOIN students s ON s.id=q.student_id WHERE p.id=? AND ${scope}`).bind(p.id, id).first<Record<string, unknown>>();
    if (!row) return Response.json({ error: "干预计划不存在。" }, { status: 404 });
    if (p.action === "cancel") {
      if (row.status === "cancelled") return Response.json({ ok: true });
      if (row.status !== "planned") return Response.json({ error: "已实施的干预应保留，不可取消。" }, { status: 409 });
      await db.prepare("UPDATE intervention_plans SET status='cancelled' WHERE id=? AND status='planned'").bind(p.id).run();
    } else {
      if (row.status === "implemented") {
        const teaching = await db.prepare("SELECT occurred_at,notes FROM teaching_records WHERE id=?").bind(row.teaching_record_id).first<Record<string, unknown>>();
        if (teaching?.occurred_at === p.occurredAt && teaching.notes === p.notes) return Response.json({ ok: true });
        return Response.json({ error: "已保存不同的实施记录，请勿覆盖历史。" }, { status: 409 });
      }
      if (row.status !== "planned") return Response.json({ error: "已取消的方案不能实施。" }, { status: 409 });
      if (p.occurredAt < String(row.created_at) || p.occurredAt <= String(row.source_at) || p.occurredAt >= String(row.due_at)) return Response.json({ error: "实施时间应晚于原作答和建立计划，并早于间隔复查。" }, { status: 400 });
      // A deterministic teaching ID and conditional insert keep retries/races atomic.
      await db.batch([
        db.prepare(`INSERT INTO teaching_records(id,inquiry_id,occurred_at,methods,reasons,outcome,notes) SELECT id,?,?,?,'[]','已讲解，尚未复查',? FROM intervention_plans WHERE id=? AND status='planned' ON CONFLICT(id) DO NOTHING`).bind(row.inquiry_id, p.occurredAt, JSON.stringify([String(row.strategy)]), p.notes, p.id),
        db.prepare("UPDATE intervention_plans SET status='implemented',teaching_record_id=id,implemented_at=? WHERE id=? AND status='planned'").bind(p.occurredAt, p.id),
      ]);
    }
    const final = await db.prepare("SELECT p.status,p.implemented_at,t.notes FROM intervention_plans p LEFT JOIN teaching_records t ON t.id=p.teaching_record_id WHERE p.id=?").bind(p.id).first<Record<string, unknown>>();
    if (final?.status !== (p.action === "cancel" ? "cancelled" : "implemented") || (p.action === "implement" && (final.implemented_at !== p.occurredAt || final.notes !== p.notes))) return Response.json({ error: "方案已由另一操作处理，请刷新。" }, { status: 409 });
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "干预操作保存失败。" }, { status: 500 }); }
}

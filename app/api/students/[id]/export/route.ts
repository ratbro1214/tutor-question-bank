import { getD1Binding } from "@/db";
import { readLearning } from "../learning/route";
import { buildDiagnosticQueue, buildLearnerProfile, withinRange } from "@/lib/learning";
import { workbook } from "@/lib/xlsx-export";
import { normalizeClassificationTags, type Classification } from "@/lib/classification";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1)
      return Response.json({ error: "学生编号无效" }, { status: 400 });
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    if (
      [from, to].some((d) => d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) ||
      (from && to && from > to)
    )
      return Response.json({ error: "日期范围无效" }, { status: 400 });
    const db = getD1Binding();
    const student = await db
      .prepare(
        "SELECT id,name,grade,notes FROM students WHERE id=? AND deleted_at IS NULL",
      )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!student)
      return Response.json({ error: "学生不存在" }, { status: 404 });
    const { events } = await readLearning(id);
    const selected = events.filter((e) => withinRange(e.occurredAt, from, to));
    const referenced = new Set(selected.map((e) => e.questionId));
    const rows = await db
      .prepare(
        "SELECT * FROM questions WHERE student_id=? AND deleted_at IS NULL ORDER BY created_at",
      )
      .bind(id)
      .all<Record<string, unknown>>();
    const questions = rows.results.filter(
      (q) =>
        referenced.has(Number(q.id)) ||
        withinRange(String(q.created_at), from, to),
    );
    const sheets = [
      {
        name: "学生档案",
        rows: [
          ["学生ID", "姓名", "年级", "档案备注", "范围开始", "范围结束"],
          [id, student.name, student.grade, student.notes, from, to],
        ],
      },
      {
        name: "题目记录",
        rows: [
          ["题目ID", "学生ID", "归档时间", "分类来源", "章节", "知识点", "数学思想与方法", "题型", "难度"],
          ...questions.map((q) => {
            const classification = normalizeClassificationTags(JSON.parse(String(q.teacher_confirmed_classification)) as Classification);
            return [
            q.id,
            id,
            q.created_at,
            ({ live_ai: "AI辅助", demo: "演示分类", manual: "人工分类", legacy: "历史来源未记录" } as Record<string, string>)[String(q.classification_source)] || "未知",
            q.chapter_name,
            classification.knowledge_points.map((p) => p.name).join("、"),
            classification.methods.map((p) => p.name).join("、"),
            q.question_type,
            q.difficulty,
          ]; }),
        ],
      },
      {
        name: "提问记录",
        rows: [
          ["提问ID", "题目ID", "提问时间", "提问原因", "备注"],
          ...selected
            .filter((e) => e.kind === "inquiry")
            .map((e) => [
              e.id,
              e.questionId,
              e.occurredAt,
              e.reasons?.join("、"),
              e.notes,
            ]),
        ],
      },
      {
        name: "教学记录",
        rows: [
          [
            "教学ID",
            "题目ID",
            "提问ID",
            "时间",
            "教学方法",
            "结果",
            "教师备注",
            "修订原记录ID",
            "教师确认的原因",
          ],
          ...selected
            .filter((e) => e.kind === "teaching")
            .map((e) => [
              e.id,
              e.questionId,
              e.inquiryId,
              e.occurredAt,
              e.methods?.join("、"),
              e.outcome,
              e.notes,
              e.supersedesId,
              e.reasons?.join("、"),
            ]),
        ],
      },
      {
        name: "真实作答与错因证据",
        rows: [
          [
            "作答ID",
            "题目ID",
            "提问ID",
            "作答时间",
            "作答阶段",
            "证据等级",
            "证据来源",
            "已记录作答",
            "结果",
            "完成方式",
            "知识点代码",
            "AI候选错因",
            "教师证据判断",
            "教师确认错误模式",
            "证据片段",
            "诊断状态",
            "候选错误模式代码",
            "候选依据",
            "备注",
          ],
          ...selected
            .filter((e) => e.kind === "attempt")
            .map((e) => [
              e.id,
              e.questionId,
              e.inquiryId,
              e.occurredAt,
              e.attemptStage,
              e.evidenceLevel,
              e.evidenceSource,
              e.responseText,
              e.correctness,
              e.supportLevel,
              e.knowledgePointCode,
              e.aiHypothesis,
              e.teacherDecision,
              e.errorLabel,
              e.evidenceExcerpt,
              e.diagnosisStatus,
              e.candidateErrorCodes?.join("、"),
              e.diagnosisBasis,
              e.notes,
            ]),
        ],
      },
      {
        name: "待诊断线索",
        rows: [
          ["作答ID", "题目ID", "时间", "证据等级", "证据来源", "状态", "候选错因", "建议诊断题"],
          ...buildDiagnosticQueue(selected).map((item) => [
            item.attemptId,
            item.questionId,
            item.occurredAt,
            item.evidenceLevel,
            item.evidenceSource,
            item.status,
            item.candidateLabels.join("、"),
            item.questions.join("；"),
          ]),
        ],
      },
      {
        name: "动态画像快照",
        rows: [
          ["知识点代码", "错误模式", "状态", "确认的证据数", "最近证据时间", "建议干预", "后续检测"],
          ...buildLearnerProfile(selected).map((profile) => [
            profile.knowledgePointCode,
            profile.errorLabel,
            profile.status,
            profile.evidenceCount,
            profile.latestAt,
            profile.intervention,
            profile.check,
          ]),
        ],
      },
      {
        name: "复查记录",
        rows: [
          [
            "记录ID",
            "题目ID",
            "提问ID",
            "活动",
            "发生时间",
            "计划复查时间",
            "复查安排ID",
            "结果",
            "备注",
          ],
          ...selected
            .filter((e) => ["review", "result"].includes(e.kind))
            .map((e) => [
              e.id,
              e.questionId,
              e.inquiryId,
              e.kind === "review" ? "安排复查" : "完成复查",
              e.occurredAt,
              e.dueAt,
              e.reviewId,
              e.outcome,
              e.notes,
            ]),
        ],
      },
    ];
    return new Response(new Uint8Array(workbook(sheets)), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="student-${id}-learning.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "导出失败，请重试。" }, { status: 500 });
  }
}

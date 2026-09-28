import { getD1Binding } from "@/db";
import { normalizeClassificationTags, validateClassification, type Classification } from "@/lib/classification";
import { rankSimilarQuestions } from "@/lib/question-similarity";
import { getBucket } from "@/lib/storage";
import { taxonomyForStage } from "@/lib/taxonomy";

export async function GET() {
  try {
    const rows = await getD1Binding().prepare(`
      SELECT q.id, q.student_id AS studentId, s.name AS studentName, s.grade AS studentGrade,
        q.image_key AS imageKey, q.extracted_question AS extractedQuestion,
        q.chapter_code AS chapterCode, q.chapter_name AS chapterName,
        q.question_type AS questionType, q.difficulty, q.created_at AS createdAt,
        k.code AS knowledgeCode, k.name AS knowledgeName
      FROM questions q
      JOIN students s ON s.id=q.student_id
      LEFT JOIN question_knowledge_points qkp ON qkp.question_id=q.id
      LEFT JOIN knowledge_points k ON k.id=qkp.knowledge_point_id
      WHERE q.deleted_at IS NULL AND s.deleted_at IS NULL
      ORDER BY q.created_at DESC, q.id DESC
    `).all<{
      id: number; studentId: number; studentName: string; studentGrade: string;
      imageKey: string; extractedQuestion: string; chapterCode: string; chapterName: string;
      questionType: string; difficulty: string; createdAt: string;
      knowledgeCode: string | null; knowledgeName: string | null;
    }>();
    const questions = new Map<number, {
      id: number; studentId: number; studentName: string; studentGrade: string;
      imageUrl: string; extractedQuestion: string; chapterCode: string; chapterName: string;
      questionType: string; difficulty: string; createdAt: string;
      knowledgePoints: { code: string; name: string }[];
    }>();
    for (const row of rows.results) {
      if (!questions.has(row.id)) questions.set(row.id, {
        id: row.id, studentId: row.studentId, studentName: row.studentName, studentGrade: row.studentGrade,
        imageUrl: `/api/images/${encodeURIComponent(row.imageKey)}`, extractedQuestion: row.extractedQuestion,
        chapterCode: row.chapterCode, chapterName: row.chapterName, questionType: row.questionType,
        difficulty: row.difficulty, createdAt: row.createdAt, knowledgePoints: [],
      });
      if (row.knowledgeCode && row.knowledgeName) {
        questions.get(row.id)!.knowledgePoints.push({ code: row.knowledgeCode, name: row.knowledgeName });
      }
    }
    return Response.json({ questions: [...questions.values()] });
  } catch {
    return Response.json({ error: "题目库加载失败，请稍后重试。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let imageKey = "";
  let committed = false;
  try {
    const form = await request.formData();
    const image = form.get("image");
    const studentId = Number(form.get("studentId"));
    const submissionId = String(form.get("submissionId") || "");
    const aiValue = String(form.get("aiClassification") || "");
    const ai = aiValue ? normalizeClassificationTags(JSON.parse(aiValue) as Classification) : null;
    const confirmedValue = JSON.parse(String(form.get("teacherConfirmedClassification") || "null")) as Classification | null;
    const confirmed = confirmedValue ? normalizeClassificationTags(confirmedValue) : null;
    const requestedSource = String(form.get("classificationSource") || "");
    const classificationSource = ai === null
      ? "manual"
      : requestedSource === "demo" ? "demo" : "live_ai";
    if (
      !(image instanceof File) ||
      !image.type.startsWith("image/") ||
      image.size > 20 * 1024 * 1024 ||
      !Number.isSafeInteger(studentId) ||
      !/^[0-9a-f-]{36}$/i.test(submissionId)
    )
      return Response.json(
        { error: "图片、学生或提交编号无效（图片上限 20MB）。" },
        { status: 400 },
      );
    if (
      (ai !== null && validateClassification(ai).length > 0) ||
      validateClassification(confirmed).length ||
      confirmed?.needs_review ||
      !confirmed?.knowledge_points.length
    )
      return Response.json(
        { error: "请先确认有效的分类及知识点。" },
        { status: 400 },
      );
    if (!confirmed) return Response.json({ error: "缺少教师确认分类。" }, { status: 400 });
    const db = getD1Binding();
    if (
      !(await db
        .prepare("SELECT id FROM students WHERE id=? AND deleted_at IS NULL")
        .bind(studentId)
        .first())
    )
      return Response.json({ error: "学生不存在。" }, { status: 404 });
    const previous = await db
      .prepare(
        "SELECT question_id AS id FROM inquiries i JOIN questions q ON q.id=i.question_id WHERE i.id=? AND q.student_id=?",
      )
      .bind(submissionId, studentId)
      .first();
    if (previous) return Response.json({ question: previous });
    const bytes = await image.arrayBuffer();
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    // Lazily hash legacy originals; archival timestamps never become invented learning events.
    const legacy = await db
      .prepare(
        "SELECT id,image_key FROM questions WHERE student_id=? AND image_hash IS NULL AND deleted_at IS NULL",
      )
      .bind(studentId)
      .all<{ id: number; image_key: string }>();
    for (const old of legacy.results) {
      const object = await getBucket().get(old.image_key);
      if (!object) continue;
      const oldHash = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await object.arrayBuffer()),
        ),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await db
        .prepare(
          "UPDATE questions SET image_hash=? WHERE id=? AND student_id=? AND image_hash IS NULL",
        )
        .bind(oldHash, old.id, studentId)
        .run();
    }
    const candidates = await db
      .prepare(
        "SELECT id,chapter_name AS chapterName FROM questions WHERE student_id=? AND image_hash=? AND deleted_at IS NULL",
      )
      .bind(studentId, hash)
      .all();
    const decision = String(form.get("duplicateDecision") || "");
    if (
      candidates.results.length &&
      !["link", "new", "later"].includes(decision)
    )
      return Response.json({ duplicates: candidates.results }, { status: 409 });
    const now = new Date().toISOString();
    if (decision === "link") {
      const linked = Number(form.get("linkedQuestionId"));
      if (!candidates.results.some((q) => q.id === linked))
        return Response.json({ error: "关联题目无效。" }, { status: 400 });
      await db
        .prepare(
          "INSERT INTO inquiries (id,question_id,occurred_at,reasons,notes) VALUES (?,?,?,'[]','') ON CONFLICT(id) DO NOTHING",
        )
        .bind(submissionId, linked, now)
        .run();
      return Response.json({ question: { id: linked } }, { status: 201 });
    }

    const existing = await db.prepare(`
      SELECT q.id, q.chapter_code AS chapterCode, q.chapter_name AS chapterName,
        q.extracted_question AS extractedQuestion,
        COALESCE((SELECT group_concat(k.code, '|')
          FROM question_knowledge_points qkp
          JOIN knowledge_points k ON k.id=qkp.knowledge_point_id
          WHERE qkp.question_id=q.id), '') AS knowledgePointCodes
      FROM questions q
      WHERE q.student_id=? AND q.deleted_at IS NULL
        AND (q.image_hash IS NULL OR q.image_hash<>?)
      ORDER BY q.created_at DESC LIMIT 500
    `).bind(studentId, hash).all<{
      id: number;
      chapterCode: string;
      chapterName: string;
      extractedQuestion: string;
      knowledgePointCodes: string;
    }>();
    const similarQuestions = rankSimilarQuestions(
      {
        chapterCode: confirmed.chapter.code,
        extractedQuestion: confirmed.extracted_question,
        knowledgePointCodes: confirmed.knowledge_points.map((point: { code: string }) => point.code),
      },
      existing.results.map((question) => ({
        ...question,
        knowledgePointCodes: question.knowledgePointCodes.split("|").filter(Boolean),
      })),
    );
    if (similarQuestions.length && !["new", "later", "similar"].includes(decision))
      return Response.json({ similarQuestions }, { status: 409 });

    let relatedQuestionId: number | undefined;
    let relationKind = "";
    if (decision === "similar") {
      relatedQuestionId = Number(form.get("relatedQuestionId"));
      relationKind = String(form.get("relationKind") || "");
      if (!similarQuestions.some((question) => question.id === relatedQuestionId))
        return Response.json({ error: "相似题候选已变化，请重新确认。" }, { status: 400 });
      if (!["同类题", "变式题", "相似错误原因"].includes(relationKind))
        return Response.json({ error: "请选择有效的关联类型。" }, { status: 400 });
    }

    imageKey = `questions/${studentId}/${crypto.randomUUID()}`;
    await getBucket().put(imageKey, bytes, {
      httpMetadata: { contentType: image.type },
    });
    const statements = [
      db
        .prepare(
          `INSERT INTO questions (student_id,image_key,image_hash,submission_id,original_filename,image_mime_type,extracted_question,chapter_code,chapter_name,question_type,difficulty,ai_classification,classification_source,teacher_confirmed_classification) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(submission_id) DO NOTHING`,
        )
        .bind(
          studentId,
          imageKey,
          hash,
          submissionId,
          image.name,
          image.type,
          confirmed.extracted_question,
          confirmed.chapter.code,
          confirmed.chapter.name,
          confirmed.question_type,
          confirmed.difficulty,
          JSON.stringify(ai),
          classificationSource,
          JSON.stringify(confirmed),
        ),
    ];
    for (const point of confirmed.knowledge_points) {
      const chapter =
        taxonomyForStage(confirmed.education_stage).find(
          ([code]) => code === point.code,
        )?.[2] || confirmed.chapter.code;
      statements.push(
        db
          .prepare(
            "INSERT INTO knowledge_points(code,name,chapter_code) VALUES (?,?,?) ON CONFLICT(code) DO NOTHING",
          )
          .bind(point.code, point.name, chapter),
      );
      statements.push(
        db
          .prepare(
            "INSERT INTO question_knowledge_points(question_id,knowledge_point_id) SELECT q.id,k.id FROM questions q,knowledge_points k WHERE q.submission_id=? AND k.code=? ON CONFLICT DO NOTHING",
          )
          .bind(submissionId, point.code),
      );
    }
    statements.push(
      db
        .prepare(
          "INSERT INTO inquiries(id,question_id,occurred_at,reasons,notes) SELECT ?,id,?,'[]','' FROM questions WHERE submission_id=? ON CONFLICT(id) DO NOTHING",
        )
        .bind(submissionId, now, submissionId),
    );
    if (relatedQuestionId !== undefined) {
      statements.push(
        db.prepare(`
          INSERT INTO question_relations(id,question_id,related_id,kind)
          SELECT ?,MIN(q.id,?),MAX(q.id,?),? FROM questions q
          WHERE q.submission_id=? AND q.student_id=?
          ON CONFLICT DO NOTHING
        `).bind(crypto.randomUUID(), relatedQuestionId, relatedQuestionId, relationKind, submissionId, studentId),
      );
    }
    await db.batch(statements);
    committed = true;
    const question = await db
      .prepare(
        "SELECT id,image_key FROM questions WHERE submission_id=? AND student_id=?",
      )
      .bind(submissionId, studentId)
      .first<{ id: number; image_key: string }>();
    if (question && question.image_key !== imageKey)
      await getBucket().delete(imageKey);
    return Response.json({ question: { id: question?.id } }, { status: 201 });
  } catch {
    if (imageKey && !committed)
      await getBucket()
        .delete(imageKey)
        .catch(() => undefined);
    return Response.json({ error: "归档失败，请重试。" }, { status: 500 });
  }
}

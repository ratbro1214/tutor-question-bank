import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const students = sqliteTable(
  "students",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    grade: text("grade").notNull().default("初中"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [index("idx_students_name").on(table.name)],
);

export const questions = sqliteTable(
  "questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    imageKey: text("image_key").notNull(),
    imageHash: text("image_hash"),
    submissionId: text("submission_id"),
    originalFilename: text("original_filename").notNull(),
    imageMimeType: text("image_mime_type").notNull(),
    extractedQuestion: text("extracted_question").notNull(),
    chapterCode: text("chapter_code").notNull(),
    chapterName: text("chapter_name").notNull(),
    questionType: text("question_type").notNull(),
    difficulty: text("difficulty").notNull(),
    aiClassification: text("ai_classification").notNull(),
    classificationSource: text("classification_source").notNull().default("legacy"),
    teacherConfirmedClassification: text(
      "teacher_confirmed_classification",
    ).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    confirmedAt: text("confirmed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("idx_questions_student_created").on(table.studentId, table.createdAt),
    index("idx_questions_chapter").on(table.chapterCode),
    index("idx_questions_hash").on(table.studentId, table.imageHash),
    uniqueIndex("uq_question_submission").on(table.submissionId),
  ],
);

export const knowledgePoints = sqliteTable(
  "knowledge_points",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    chapterCode: text("chapter_code").notNull(),
  },
  (table) => [uniqueIndex("uq_knowledge_points_code").on(table.code)],
);

export const questionKnowledgePoints = sqliteTable(
  "question_knowledge_points",
  {
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    knowledgePointId: integer("knowledge_point_id")
      .notNull()
      .references(() => knowledgePoints.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.questionId, table.knowledgePointId] }),
    index("idx_question_kp_knowledge_point").on(table.knowledgePointId),
  ],
);

// Learning history is append-only. Corrections refer to the record they supersede.
export const inquiries = sqliteTable(
  "inquiries",
  {
    id: text("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    occurredAt: text("occurred_at").notNull(),
    reasons: text("reasons").notNull().default("[]"),
    notes: text("notes").notNull().default(""),
  },
  (t) => [index("idx_inquiries_question").on(t.questionId, t.occurredAt)],
);

// A student's actual work is evidence. It is stored separately from the
// question itself and from the teacher's later interpretation of the error.
export const studentAttempts = sqliteTable(
  "student_attempts",
  {
    id: text("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    inquiryId: text("inquiry_id").references(() => inquiries.id, {
      onDelete: "set null",
    }),
    occurredAt: text("occurred_at").notNull(),
    stage: text("stage").notNull(),
    knowledgePointCode: text("knowledge_point_code").notNull().default(""),
    evidenceLevel: text("evidence_level").notNull().default("仅有最终答案"),
    evidenceSource: text("evidence_source").notNull().default("其他"),
    responseText: text("response_text").notNull(),
    correctness: text("correctness").notNull(),
    supportLevel: text("support_level").notNull(),
    notes: text("notes").notNull().default(""),
  },
  (t) => [index("idx_student_attempts_question").on(t.questionId, t.occurredAt)],
);

// AI output remains a hypothesis. Only the teacher decision and confirmed
// code are used to update the evidence-backed learner profile.
export const errorEvidence = sqliteTable(
  "error_evidence",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => studentAttempts.id, { onDelete: "cascade" }),
    knowledgePointCode: text("knowledge_point_code").notNull(),
    aiHypothesis: text("ai_hypothesis"),
    teacherDecision: text("teacher_decision").notNull(),
    errorCode: text("error_code"),
    errorLabel: text("error_label"),
    evidenceExcerpt: text("evidence_excerpt").notNull().default(""),
    diagnosisStatus: text("diagnosis_status").notNull().default("错因未知"),
    candidateErrorCodes: text("candidate_error_codes").notNull().default("[]"),
    diagnosisBasis: text("diagnosis_basis").notNull().default(""),
    notes: text("notes").notNull().default(""),
  },
  (t) => [index("idx_error_evidence_attempt").on(t.attemptId)],
);

// Generated diagnostic material is a teacher-reviewable draft. It never
// becomes learner evidence until a separate student attempt is recorded.
export const diagnosticPlans = sqliteTable(
  "diagnostic_plans",
  {
    id: text("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sourceAttemptId: text("source_attempt_id")
      .notNull()
      .references(() => studentAttempts.id, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    knowledgePointCode: text("knowledge_point_code").notNull().default(""),
    content: text("content").notNull(),
    generationMode: text("generation_mode").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: text("created_at").notNull(),
    decidedAt: text("decided_at"),
  },
  (t) => [
    index("idx_diagnostic_plans_question").on(t.questionId, t.createdAt),
    index("idx_diagnostic_plans_status").on(t.status),
  ],
);
export const teachingRecords = sqliteTable("teaching_records", {
  id: text("id").primaryKey(),
  inquiryId: text("inquiry_id")
    .notNull()
    .references(() => inquiries.id, { onDelete: "cascade" }),
  occurredAt: text("occurred_at").notNull(),
  methods: text("methods").notNull().default("[]"),
  reasons: text("reasons").notNull().default("[]"),
  outcome: text("outcome").notNull(),
  notes: text("notes").notNull().default(""),
  supersedesId: text("supersedes_id"),
});
export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  inquiryId: text("inquiry_id")
    .notNull()
    .references(() => inquiries.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  dueAt: text("due_at").notNull(),
});
export const reviewResults = sqliteTable(
  "review_results",
  {
    id: text("id").primaryKey(),
    reviewId: text("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    occurredAt: text("occurred_at").notNull(),
    outcome: text("outcome").notNull(),
    notes: text("notes").notNull().default(""),
  },
  (t) => [uniqueIndex("uq_review_completion").on(t.reviewId)],
);
export const questionRelations = sqliteTable(
  "question_relations",
  {
    id: text("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    relatedId: integer("related_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
  },
  (t) => [uniqueIndex("uq_relation").on(t.questionId, t.relatedId, t.kind)],
);

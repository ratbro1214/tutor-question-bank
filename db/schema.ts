import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const students = sqliteTable("students", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  grade: text("grade").notNull().default("初中"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_students_name").on(table.name)]);

export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  imageKey: text("image_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  imageMimeType: text("image_mime_type").notNull(),
  extractedQuestion: text("extracted_question").notNull(),
  chapterCode: text("chapter_code").notNull(),
  chapterName: text("chapter_name").notNull(),
  questionType: text("question_type").notNull(),
  difficulty: text("difficulty").notNull(),
  aiClassification: text("ai_classification").notNull(),
  teacherConfirmedClassification: text("teacher_confirmed_classification").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  confirmedAt: text("confirmed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_questions_student_created").on(table.studentId, table.createdAt),
  index("idx_questions_chapter").on(table.chapterCode),
]);

export const knowledgePoints = sqliteTable("knowledge_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  chapterCode: text("chapter_code").notNull(),
}, (table) => [uniqueIndex("uq_knowledge_points_code").on(table.code)]);

export const questionKnowledgePoints = sqliteTable("question_knowledge_points", {
  questionId: integer("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  knowledgePointId: integer("knowledge_point_id").notNull().references(() => knowledgePoints.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.questionId, table.knowledgePointId] }),
  index("idx_question_kp_knowledge_point").on(table.knowledgePointId),
]);

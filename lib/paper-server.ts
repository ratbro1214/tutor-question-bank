import { getD1Binding } from "@/db";
import type { PaperQuestion, PaperSummary } from "./paper";
import type { Classification } from "./classification";
import type { ExplanationContent } from "./question-explanation";

export type PaperRow = { id: string; title: string; original_filename: string; source_key: string; source_type: string; created_at: string; question_count?: number; completed_count?: number };
export type PaperQuestionRow = { id: string; paper_id: string; question_number: number; regions: string; image_key: string; question_text: string; classification: string | null; explanation: string | null; model: string; revision: number; status: string; error: string; generation_token: string | null; updated_at: string };
export const validPaperId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
export function publicPaper(row: PaperRow): PaperSummary {
  return { id: row.id, title: row.title, originalFilename: row.original_filename, sourceUrl: `/api/images/${encodeURIComponent(row.source_key)}`, sourceType: row.source_type, createdAt: row.created_at, questionCount: row.question_count || 0, completedCount: row.completed_count || 0 };
}
export function publicPaperQuestion(row: PaperQuestionRow): PaperQuestion {
  return { id: row.id, number: row.question_number, revision: row.revision, regions: JSON.parse(row.regions), imageUrl: `/api/images/${encodeURIComponent(row.image_key)}`, questionText: row.question_text,
    classification: row.classification ? JSON.parse(row.classification) as Classification : null,
    explanation: row.explanation ? { content: JSON.parse(row.explanation) as ExplanationContent, sourceText: row.question_text, model: row.model, revision: row.revision, reviewed: false, origin: "ai", updatedAt: row.updated_at } : null,
    status: row.status, error: row.error, updatedAt: row.updated_at };
}
export async function findPaper(id: string) {
  if (!validPaperId(id)) return null;
  return getD1Binding().prepare("SELECT p.*, (SELECT count(*) FROM paper_questions WHERE paper_id=p.id) AS question_count, (SELECT count(*) FROM paper_questions WHERE paper_id=p.id AND explanation IS NOT NULL) AS completed_count FROM papers p WHERE id=?").bind(id).first<PaperRow>();
}
export function paperFailure(error: unknown) {
  console.warn("paper_request_failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  return Response.json({ error: "套卷暂时无法读取或保存，请稍后重试。" }, { status: 500 });
}

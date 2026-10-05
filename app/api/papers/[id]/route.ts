import { getD1Binding } from "@/db";
import { findPaper, paperFailure, publicPaper, publicPaperQuestion, type PaperQuestionRow } from "@/lib/paper-server";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, paper = await findPaper(id);
    if (!paper) return Response.json({ error: "套卷不存在。" }, { status: 404 });
    const questions = await getD1Binding().prepare("SELECT * FROM paper_questions WHERE paper_id=? ORDER BY question_number").bind(id).all<PaperQuestionRow>();
    return Response.json({ paper: publicPaper(paper), questions: questions.results.map(publicPaperQuestion) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return paperFailure(error); }
}

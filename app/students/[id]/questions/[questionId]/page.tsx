import { AppShell } from "@/components/app-shell";
import { QuestionDetail } from "@/components/question-detail";

export default async function QuestionDetailPage({ params }: { params: Promise<{ id: string; questionId: string }> }) {
  const { id, questionId } = await params;
  return <AppShell><QuestionDetail studentId={id} questionId={questionId} /></AppShell>;
}

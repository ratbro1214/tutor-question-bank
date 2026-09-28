import { AppShell } from "@/components/app-shell";
import { QuestionDetail } from "@/components/question-detail";

export default async function QuestionDetailPage({ params, searchParams }: { params: Promise<{ id: string; questionId: string }>; searchParams: Promise<{ diagnosticPlanId?: string }> }) {
  const { id, questionId } = await params;
  const { diagnosticPlanId } = await searchParams;
  return <AppShell><QuestionDetail studentId={id} questionId={questionId} diagnosticPlanId={diagnosticPlanId} /></AppShell>;
}

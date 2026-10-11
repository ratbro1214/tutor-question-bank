import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { QuestionDetail } from '@/components/question-detail';
import { getD1Binding } from '@/db';

export default async function LibraryQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, questionId = Number(id);
  if (!Number.isInteger(questionId) || questionId < 1) notFound();
  const row = await getD1Binding().prepare('SELECT q.student_id FROM questions q JOIN students s ON s.id=q.student_id WHERE q.id=? AND q.deleted_at IS NULL AND s.deleted_at IS NULL').bind(questionId).first<{ student_id: number }>();
  if (!row) notFound();
  return <AppShell><QuestionDetail studentId={String(row.student_id)} questionId={id} entry="library" /></AppShell>;
}

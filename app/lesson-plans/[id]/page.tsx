import { AppShell } from '@/components/app-shell';
import { LessonPlanEditor } from '@/components/lesson-workbench';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; await requireChatGPTUser('/lesson-plans/' + id); return <AppShell><LessonPlanEditor id={id} /></AppShell>; }

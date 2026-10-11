import { AppShell } from '@/components/app-shell';
import { LessonPlanList } from '@/components/lesson-workbench';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export default async function Page() { await requireChatGPTUser('/lesson-plans'); return <AppShell><LessonPlanList /></AppShell>; }

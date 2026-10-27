import { AppShell } from '@/components/app-shell';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { QuadraticTopicLab } from '@/components/quadratic-topic-lab';

export default async function Page() {
  await requireChatGPTUser('/topic-lab');
  return <AppShell><QuadraticTopicLab /></AppShell>;
}

import { AppShell } from '@/components/app-shell';
import { GaokaoWorkbench } from '@/components/gaokao-workbench';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  await requireChatGPTUser(`/gaokao/${key}`);
  return <AppShell><GaokaoWorkbench key={key} paperKey={key} /></AppShell>;
}

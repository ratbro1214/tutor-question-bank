import { GaokaoLibrary } from '@/components/gaokao-library';
import { AppShell } from '@/components/app-shell';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export default async function Page(){await requireChatGPTUser('/gaokao');return <AppShell><GaokaoLibrary/></AppShell>;}

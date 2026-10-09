import { AppShell } from '@/components/app-shell';
import { MathLibrary } from '@/components/math-library';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export default async function Page(){await requireChatGPTUser('/math-library');return <AppShell><MathLibrary/></AppShell>;}

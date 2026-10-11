import { AppShell } from '@/components/app-shell';
import { KnowledgeMethods } from '@/components/knowledge-methods';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export default async function Page() { await requireChatGPTUser('/math-methods'); return <AppShell><KnowledgeMethods /></AppShell>; }

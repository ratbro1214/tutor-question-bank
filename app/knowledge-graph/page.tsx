import { AppShell } from '@/components/app-shell';
import { KnowledgeGraph } from '@/components/knowledge-graph';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export default async function Page() { await requireChatGPTUser('/knowledge-graph'); return <AppShell><KnowledgeGraph /></AppShell>; }

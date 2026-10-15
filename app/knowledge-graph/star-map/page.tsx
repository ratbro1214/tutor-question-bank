import { AppShell } from '@/components/app-shell';
import { KnowledgeGraph } from '@/components/knowledge_graph/KnowledgeGraph';
import { requireChatGPTUser } from '@/app/chatgpt-auth';

export default async function Page() {
  await requireChatGPTUser('/knowledge-graph/star-map');
  return <AppShell><KnowledgeGraph /></AppShell>;
}

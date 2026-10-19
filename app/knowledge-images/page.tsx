import { AppShell } from '@/components/app-shell';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { KnowledgeImages } from '@/components/knowledge-images';
export default async function Page() {
 await requireChatGPTUser('/knowledge-images');
 return <AppShell><KnowledgeImages /></AppShell>;
}

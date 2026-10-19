import Link from 'next/link';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export default async function KnowledgeNetworkPage() {
 await requireChatGPTUser('/knowledge-network');
 return <div className="flex h-dvh flex-col overflow-hidden bg-[#f7fafc]">
  <nav aria-label="工作台导航" className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 text-xs text-slate-500">
   <Link href="/knowledge-graph/star-map" className="font-medium text-[#173b68] hover:underline">← 返回教学工作台</Link>
   <div className="flex items-center gap-4"><Link href="/knowledge-images" className="hover:underline">知识图片</Link><span className="hidden sm:inline">数学知识网络 · 本地资料</span></div>
  </nav>
  <iframe src="/math-network/index.html#view=all&layout=free&depth=1&related=1&lessons=1" title="数学知识网络：全景网络与分层图谱" className="min-h-0 w-full flex-1 border-0" allowFullScreen />
 </div>;
}

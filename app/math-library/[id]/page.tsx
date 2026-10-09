import { AppShell } from '@/components/app-shell';
import { MathLibraryDetail } from '@/components/math-library';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;await requireChatGPTUser('/math-library/'+encodeURIComponent(id));return <AppShell><MathLibraryDetail id={id}/></AppShell>;}

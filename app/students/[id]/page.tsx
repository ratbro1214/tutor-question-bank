import { AppShell } from "@/components/app-shell";
import { StudentBank } from "@/components/student-bank";
export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) { const { id } = await params; const { tab } = await searchParams; return <AppShell><StudentBank key={`${id}:${tab || 'overview'}`} id={id} initialTab={tab} /></AppShell>; }

import { AppShell } from "@/components/app-shell";
import { StudentBank } from "@/components/student-bank";
export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AppShell><StudentBank id={id} /></AppShell>; }

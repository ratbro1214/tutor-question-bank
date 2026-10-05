import { AppShell } from "@/components/app-shell";
import { PaperWorkbench } from "@/components/paper-workbench";
export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AppShell><PaperWorkbench key={id} paperId={id} /></AppShell>; }

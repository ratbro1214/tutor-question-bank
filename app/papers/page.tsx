import { AppShell } from "@/components/app-shell";
import { PaperWorkbench } from "@/components/paper-workbench";
import { PaperBatchImport } from "@/components/paper-batch-import";
export default function PapersPage() { return <AppShell><div className="space-y-6"><PaperBatchImport /><PaperWorkbench /></div></AppShell>; }

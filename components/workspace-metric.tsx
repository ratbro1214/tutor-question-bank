import type { ReactNode } from "react";

export function WorkspaceMetric({ label, value, note, icon }: { label: string; value: ReactNode; note: string; icon?: ReactNode }) {
  return <article className="surface-card p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-500">{label}</p><span className="text-terracotta-800">{icon}</span></div><p className="mt-3 text-[32px] font-semibold leading-tight tracking-tight text-slate-950 tabular-nums">{value}</p><p className="mt-3 text-xs leading-5 text-slate-500">{note}</p></article>;
}

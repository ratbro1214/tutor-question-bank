import type { ReactNode } from "react";
import { AnimatedNumber } from "./animated-number";

export function WorkspaceMetric({ label, value, note, icon }: { label: string; value: ReactNode; note: string; icon?: ReactNode }) {
  return <article className="surface-card relative overflow-hidden p-5 sm:p-6"><span aria-hidden="true" className="metric-watermark">{icon}</span><div className="relative flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-500">{label}</p><span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-terracotta-50 text-terracotta-700">{icon}</span></div><p className="relative mt-3 text-[36px] font-semibold leading-tight tracking-tight text-slate-950 tabular-nums">{typeof value === 'number' && Number.isFinite(value) ? <AnimatedNumber value={value} /> : value}</p><p className="relative mt-3 max-w-[24ch] text-xs leading-5 text-slate-500">{note}</p></article>;
}

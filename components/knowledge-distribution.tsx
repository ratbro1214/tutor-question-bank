"use client";

import { cn } from "@/lib/utils";

type PointCount = [string, { name: string; count: number }];

export function KnowledgeDistribution({ points, selected, onSelect }: {
  points: PointCount[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const maximum = Math.max(1, ...points.map(([, item]) => item.count));
  return <section className="rounded-lg border border-slate-200 bg-white p-5" aria-label="归档题目知识点分布">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="font-bold text-slate-950">归档题目知识点分布</h2><p className="mt-1 text-sm leading-6 text-slate-500">点击条形图筛选题目，再次点击可取消。条形长度以最高频知识点为基准。</p></div>
      <span className="shrink-0 font-mono text-xs text-slate-400">TOP {Math.min(6, points.length)}</span>
    </div>
    <div className="mt-4 space-y-1">
      {points.slice(0, 6).map(([code, item]) => <button key={code} type="button" aria-pressed={selected === code} aria-controls="student-questions" aria-label={`${item.name}，涉及 ${item.count} 道归档题目${selected === code ? "，取消筛选" : "，筛选题目"}`} title={item.name} onClick={() => onSelect(code)} className={cn("grid w-full grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_2rem] items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-terracotta-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700", selected === code && "bg-terracotta-50 ring-1 ring-inset ring-terracotta-300")}>
        <span className="truncate font-medium text-slate-700">{item.name}</span>
        <span aria-hidden="true" className="h-6 overflow-hidden rounded-sm bg-slate-100"><span className={cn("knowledge-frequency-bar block h-full origin-left rounded-sm", selected === code ? "bg-terracotta-800" : "bg-terracotta-600")} style={{ width: `${item.count / maximum * 100}%` }} /></span>
        <b className="text-right font-mono tabular-nums text-slate-950">{item.count}</b>
      </button>)}
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-500">统计每个知识点涉及的归档题目数。一题可含多个知识点，次数不代表掌握率。</p>
  </section>;
}

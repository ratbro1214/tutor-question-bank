"use client";

import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const steps = ["准备图片", "上传与校验", "识别题目", "核对标签"];
const stageIndex: Record<string, number> = {
  preparing: 0, uploading: 1, uploaded: 1, preprocessing: 1,
  cache_check: 1, recognizing: 2, validating: 3, reviewing: 3,
};

export function RecognitionStatus({ state, message, seconds, analyzing, onCancel }: {
  state: string;
  message: string;
  seconds: number;
  analyzing: boolean;
  onCancel: () => void;
}) {
  const active = stageIndex[state] ?? 0;
  return <div className="rounded-xl border border-terracotta-200 bg-terracotta-50/60 p-4">
    <div className="flex items-start gap-3">
      <LoaderCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin text-terracotta-700" />
      <div className="min-w-0 flex-1">
        <p role="status" aria-live="polite" aria-atomic="true" className="text-sm font-semibold text-terracotta-950">{message || "正在准备识别副本"}</p>
        <p className="mt-1 text-xs leading-5 text-terracotta-800">{analyzing ? `已等待 ${seconds} 秒，可先填写右侧分类。` : "正在准备清晰的识别副本。"}</p>
      </div>
      {analyzing && <Button type="button" size="sm" variant="outline" onClick={onCancel}>取消识别</Button>}
    </div>
    <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="识别处理阶段">
      {steps.map((label, index) => <li key={label} aria-current={index === active ? "step" : undefined} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors", index === active ? "border-terracotta-300 bg-white font-semibold text-terracotta-900" : index < active ? "border-transparent text-terracotta-800" : "border-transparent text-slate-500")}>
        <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center rounded-full", index <= active ? "bg-terracotta-700 text-white" : "bg-slate-200 text-slate-600")}>{index < active ? <Check className="size-3" /> : index + 1}</span>
        <span>{label}<span className="sr-only">{index === active ? "，进行中" : index < active ? "，已完成" : "，待处理"}</span></span>
      </li>)}
    </ol>
    <p className="mt-3 text-xs leading-5 text-slate-600">按实际处理阶段更新；完成识别后，还需教师确认分类。</p>
  </div>;
}

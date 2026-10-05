"use client";
import type { EvidenceReference, LearningEvent } from "@/lib/learning";

export function EvidenceTrail({ studentId, evidence, events }: {
  studentId: string; evidence: EvidenceReference[]; events: LearningEvent[];
}) {
  return <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
    <summary className="cursor-pointer text-xs font-medium text-slate-700">查看依据 · {evidence.length} 条原始记录</summary>
    <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
      {evidence.map((ref) => {
        const event = events.find((item) => item.id === ref.eventId);
        return <li key={`${ref.eventId}-${ref.label}`}>
          <a className="font-medium text-terracotta-700 underline" href={`/students/${studentId}/questions/${ref.questionId}#learning-event-${ref.eventId}`}>
            题目 #{ref.questionId} · {ref.label}
          </a>
          <span className="ml-2">{new Date(ref.occurredAt).toLocaleString("zh-CN")}</span>
          {event?.kind === "attempt" && <p className="whitespace-pre-wrap">{event.responseText} · {event.correctness} · {event.supportLevel}</p>}
          {event?.kind === "teaching" && <p>{event.methods?.join("、")} · {event.outcome}</p>}
        </li>;
      })}
    </ul>
  </details>;
}

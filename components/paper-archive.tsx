"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PaperQuestion } from "@/lib/paper";
type ArchiveResult = { questions: { number: number; existing: boolean; url: string }[]; studentUrl: string };

export function PaperArchive({ paperId, questions, disabled }: { paperId: string; questions: PaperQuestion[]; disabled: boolean }) {
  const [students, setStudents] = useState<{ id: number; name: string; grade: string }[]>([]);
  const [studentId, setStudentId] = useState(""), [confirmed, setConfirmed] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [result, setResult] = useState<ArchiveResult | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/students", { signal: controller.signal }).then(async response => {
      const data = await response.json() as { error?: string; students: { id: number; name: string; grade: string }[] }; if (!response.ok) throw Error(data.error || "题库加载失败"); setStudents(data.students);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "题库加载失败"); });
    return () => controller.abort();
  }, []);
  async function archive() {
    setSaving(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/papers/${paperId}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: Number(studentId), confirmed, questions: questions.map(q => ({ id: q.id, revision: q.revision })) }) });
      const data = await response.json() as ArchiveResult & { error?: string }; if (!response.ok) throw Error(data.error || "添加失败，请重试。已添加的题目不会重复。"); setResult(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "添加失败。"); }
    finally { setSaving(false); }
  }
  return <section className="surface-card space-y-3 p-4" aria-label="加入个人题库">
    <h2 className="font-semibold">加入个人题库</h2>
    <p className="text-sm leading-6 text-slate-500">勾选套卷题目，将原图、分类、知识点和已有解析一起添加。个人题库中的修改独立保存，重复添加会打开已有题目。</p>
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm">目标题库 <select aria-label="目标题库" value={studentId} disabled={disabled || saving} onChange={e => { setStudentId(e.target.value); setResult(null); }} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">选择个人 / 学生档案</option>{students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.grade}</option>)}</select></label>
      <Button disabled={disabled || saving || !studentId || !questions.length || !confirmed} onClick={() => void archive()}>{saving ? "正在添加…" : `添加所选 ${questions.length} 题到题库`}</Button></div>
    {!students.length && <p className="text-sm text-slate-500">可先到<Link href="/" className="text-terracotta-800 underline">仪表盘</Link>创建自己的复习档案。</p>}
    {questions.length > 0 && <ul className="flex flex-wrap gap-2 text-xs text-slate-600">{questions.map(q => <li className="rounded-lg bg-slate-50 px-3 py-2" key={q.id}>第 {q.number} 题 · {q.classification?.chapter.name || "尚未分类"} · {q.classification?.knowledge_points.map(k => k.name).join("、") || "请先完成解析"}</li>)}</ul>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" aria-label="已核对所选题目的原图与分类" checked={confirmed} disabled={disabled || saving || !questions.length} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />已核对所选题目的原图与分类；解析保留为 AI 辅助内容。</label>
    {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
    {result && <div role="status" className="space-y-2 rounded-lg bg-terracotta-50 p-3 text-sm text-terracotta-900"><p>新增 {result.questions.filter(q => !q.existing).length} 题，已在题库 {result.questions.filter(q => q.existing).length} 题。<Link className="ml-2 underline" href={result.studentUrl}>查看个人题库</Link></p><div className="flex flex-wrap gap-3">{result.questions.map(q => <Link href={q.url} className="underline" key={q.number}>第 {q.number} 题{q.existing ? "（已有）" : ""}</Link>)}</div></div>}
  </section>;
}

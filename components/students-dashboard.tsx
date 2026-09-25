"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Plus, Search, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Student = { id: number; name: string; grade: string; notes: string; questionCount: number; latestQuestionAt: string | null };

export function StudentsDashboard() {
  const [students, setStudents] = useState<Student[]>([]); const [query, setQuery] = useState(""); const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function loadStudents() { setLoading(true); const response = await fetch("/api/students", { cache: "no-store" }); const data = await response.json(); if (!response.ok) setError(data.error || "加载失败"); else { setStudents(data.students); setError(""); } setLoading(false); }
  useEffect(() => { void loadStudents(); }, []);
  const filtered = useMemo(() => students.filter((s) => `${s.name}${s.grade}${s.notes}`.toLowerCase().includes(query.toLowerCase())), [students, query]);
  const questionTotal = students.reduce((sum, item) => sum + Number(item.questionCount), 0);
  async function createStudent(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget); const response = await fetch("/api/students", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), grade: form.get("grade"), notes: form.get("notes") }) }); const data = await response.json(); if (!response.ok) setError(data.error || "保存失败"); else { setOpen(false); await loadStudents(); } setSaving(false); }
  return <div className="space-y-8">
    <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="mb-2 text-sm font-semibold text-indigo-600">学生档案</p><h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">每次提问，都留下可回看的线索</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">管理学生题目、知识点与提问趋势。提问记录只表示学习活动，不直接判断学生是否掌握。</p></div>
      <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="lg" className="bg-indigo-600 shadow-lg shadow-indigo-200 hover:bg-indigo-700"><Plus />新建学生档案</Button></DialogTrigger><DialogContent><form onSubmit={createStudent}><DialogHeader><DialogTitle>新建学生档案</DialogTitle><DialogDescription>先记录基础信息，后续题目会自动归入该学生的题库。</DialogDescription></DialogHeader><div className="my-6 grid gap-4"><div className="grid gap-2"><Label htmlFor="name">学生姓名</Label><Input id="name" name="name" placeholder="例如：小林" required autoFocus /></div><div className="grid gap-2"><Label htmlFor="grade">年级</Label><Input id="grade" name="grade" placeholder="例如：初二" defaultValue="初中" /></div><div className="grid gap-2"><Label htmlFor="notes">备注</Label><Textarea id="notes" name="notes" placeholder="选填，例如授课时间或学习目标" /></div></div><DialogFooter><Button type="submit" disabled={saving}>{saving ? "保存中…" : "保存档案"}</Button></DialogFooter></form></DialogContent></Dialog>
    </section>
    <section className="grid gap-4 sm:grid-cols-3">{[{ label: "学生", value: students.length, icon: UserRound }, { label: "已归档题目", value: questionTotal, icon: BookOpen }, { label: "待开始", value: students.filter(s => !Number(s.questionCount)).length, icon: Sparkles }].map(({ label, value, icon: Icon }) => <Card key={label} className="border-slate-200 bg-white/90 shadow-sm"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold text-slate-950">{value}</p></div><span className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon className="size-5" /></span></CardContent></Card>)}</section>
    <section><div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-xl font-bold text-slate-950">学生列表</h2><div className="relative w-full max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索学生" className="bg-white pl-9" /></div></div>
      {error && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">正在读取学生档案…</div> : filtered.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((student) => <Link href={`/students/${student.id}`} key={student.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><div className="flex items-start justify-between"><span className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-lg font-bold text-white">{student.name.slice(0, 1)}</span><ArrowRight className="size-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-600" /></div><h3 className="mt-5 text-xl font-bold text-slate-950">{student.name}</h3><p className="mt-1 text-sm text-slate-500">{student.grade}{student.notes ? ` · ${student.notes}` : ""}</p><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm"><b className="text-slate-900">{student.questionCount} 道题</b><span className="flex items-center gap-1 text-slate-500"><CalendarDays className="size-4" />{student.latestQuestionAt ? new Date(student.latestQuestionAt + "Z").toLocaleDateString("zh-CN") : "暂无记录"}</span></div></Link>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-12 text-center"><UserRound className="mx-auto size-9 text-slate-300" /><h3 className="mt-4 font-semibold text-slate-900">还没有匹配的学生</h3><p className="mt-1 text-sm text-slate-500">新建档案后即可开始上传题目。</p></div>}
    </section>
  </div>;
}

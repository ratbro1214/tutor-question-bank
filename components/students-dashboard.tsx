"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, CalendarDays, CheckCircle2, LoaderCircle, Plus, RotateCcw, Search, Sparkles, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Student = { id: number; name: string; grade: string; notes: string; questionCount: number; latestQuestionAt: string | null };
type TrashData = {
  students: { id: number; name: string; grade: string; deletedAt: string }[];
  questions: { id: number; studentName: string; chapterName: string; originalFilename: string; deletedAt: string }[];
};

function formatActivity(value: string | null) {
  if (!value) return "暂无记录";
  const date = new Date(`${value}Z`);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function StudentsDashboard() {
  const [students, setStudents] = useState<Student[]>([]); const [query, setQuery] = useState(""); const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false); const [trash, setTrash] = useState<TrashData>({ students: [], questions: [] }); const [trashBusy, setTrashBusy] = useState("");
  async function loadStudents() { setLoading(true); const response = await fetch("/api/students", { cache: "no-store" }); const data = await response.json() as TrashData & {error:string;students:Student[]}; if (!response.ok) setError(data.error || "加载失败"); else { setStudents(data.students); setError(""); } setLoading(false); }
  useEffect(() => { void Promise.resolve().then(loadStudents); }, []);
  const filtered = useMemo(() => students.filter((s) => `${s.name}${s.grade}${s.notes}`.toLowerCase().includes(query.toLowerCase())), [students, query]);
  const questionTotal = students.reduce((sum, item) => sum + Number(item.questionCount), 0);
  async function createStudent(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget); const response = await fetch("/api/students", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), grade: form.get("grade"), notes: form.get("notes") }) }); const data = await response.json() as TrashData & {error:string;students:Student[]}; if (!response.ok) setError(data.error || "保存失败"); else { setOpen(false); await loadStudents(); } setSaving(false); }
  async function loadTrash() { const response = await fetch("/api/trash", { cache: "no-store" }); const data = await response.json() as TrashData & {error:string;students:Student[]}; if (!response.ok) setError(data.error || "无法读取回收站"); else setTrash(data); }
  async function changeTrash(method: "POST" | "DELETE", type: "student" | "question", id: number) {
    if (method === "DELETE" && !window.confirm("确定永久删除吗？此操作无法恢复。")) return;
    const key = `${type}-${id}-${method}`; setTrashBusy(key); setError("");
    try {
      const response = await fetch("/api/trash", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id }) });
      const data = await response.json() as TrashData & {error:string;students:Student[]}; if (!response.ok) throw new Error(data.error || "操作失败");
      await Promise.all([loadTrash(), loadStudents()]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); } finally { setTrashBusy(""); }
  }
  return <div className="space-y-8">
    <section className="flex flex-col gap-5 border-b border-slate-200 pb-7 md:flex-row md:items-end md:justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">学生档案</p><h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">学生学习工作台</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">集中查看学生题目、知识点与最近活动。记录学习线索，不替学生下掌握结论。</p></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Dialog open={trashOpen} onOpenChange={(value) => { setTrashOpen(value); if (value) void loadTrash(); }}><DialogTrigger asChild><Button size="lg" variant="outline"><Trash2 />回收站</Button></DialogTrigger><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>回收站</DialogTitle><DialogDescription>可恢复误删的学生和题目，永久删除后无法找回。</DialogDescription></DialogHeader><div className="my-5 max-h-[60vh] space-y-5 overflow-y-auto pr-1">{!trash.students.length && !trash.questions.length ? <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">回收站为空</p> : <>{trash.students.length > 0 && <section><h3 className="mb-2 text-sm font-semibold text-slate-800">学生</h3><div className="space-y-2">{trash.students.map(item => <div key={`student-${item.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0 flex-1"><b className="block truncate text-slate-900">{item.name}</b><span className="text-xs text-slate-500">{item.grade} · 包含其全部题目</span></div><Button size="sm" variant="outline" onClick={() => changeTrash("POST", "student", item.id)} disabled={!!trashBusy}>{trashBusy === `student-${item.id}-POST` ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}恢复</Button><Button size="sm" variant="outline" onClick={() => changeTrash("DELETE", "student", item.id)} disabled={!!trashBusy} className="text-red-700">永久删除</Button></div>)}</div></section>}{trash.questions.length > 0 && <section><h3 className="mb-2 text-sm font-semibold text-slate-800">单独删除的题目</h3><div className="space-y-2">{trash.questions.map(item => <div key={`question-${item.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0 flex-1"><b className="block truncate text-slate-900">{item.originalFilename}</b><span className="text-xs text-slate-500">{item.studentName} · {item.chapterName}</span></div><Button size="sm" variant="outline" onClick={() => changeTrash("POST", "question", item.id)} disabled={!!trashBusy}>{trashBusy === `question-${item.id}-POST` ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}恢复</Button><Button size="sm" variant="outline" onClick={() => changeTrash("DELETE", "question", item.id)} disabled={!!trashBusy} className="text-red-700">永久删除</Button></div>)}</div></section>}</>}</div></DialogContent></Dialog>
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="lg"><Plus />新建学生档案</Button></DialogTrigger><DialogContent><form onSubmit={createStudent}><DialogHeader><DialogTitle>新建学生档案</DialogTitle><DialogDescription>先记录基础信息，后续题目会自动归入该学生的题库。</DialogDescription></DialogHeader><div className="my-6 grid gap-4"><div className="grid gap-2"><Label htmlFor="name">学生姓名</Label><Input id="name" name="name" placeholder="例如：小林" required autoFocus /></div><div className="grid gap-2"><Label htmlFor="grade">年级</Label><Input id="grade" name="grade" placeholder="例如：初二" defaultValue="初中" /></div><div className="grid gap-2"><Label htmlFor="notes">备注</Label><Textarea id="notes" name="notes" placeholder="选填，例如授课时间或学习目标" /></div></div><DialogFooter><Button type="submit" disabled={saving}>{saving ? "保存中…" : "保存档案"}</Button></DialogFooter></form></DialogContent></Dialog>
      </div>
    </section>
    <section className="grid grid-cols-1 border-y border-slate-200 bg-white sm:grid-cols-[1fr_1fr_1.4fr]">{[
      { label: "学生", value: students.length, icon: UserRound, note: "已建立档案" },
      { label: "归档题目", value: questionTotal, icon: BookOpen, note: "累计学习记录" },
      { label: "待开始", value: students.filter(s => !Number(s.questionCount)).length, icon: Sparkles, note: students.some(s => !Number(s.questionCount)) ? "可安排首次题目录入" : "暂无待办任务，学生进度良好" },
    ].map(({ label, value, icon: Icon, note }, index) => <div key={label} className={`flex items-center gap-4 px-5 py-4 ${index ? "border-t border-slate-200 sm:border-l sm:border-t-0" : ""}`}><span className="grid size-9 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700"><Icon className="size-[18px]" /></span><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{label}</p><div className="flex items-baseline gap-3"><strong className="font-mono text-[30px] font-bold leading-tight tabular-nums text-slate-950">{value}</strong><span className="hidden truncate text-xs text-slate-400 md:inline">{note}</span></div></div></div>)}</section>
    <section><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold text-slate-950">学生列表</h2><p className="mt-1 text-sm text-slate-500">按最近学习活动快速进入学生档案</p></div><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索姓名、年级或备注" className="bg-white pl-9" /></div></div>
      {error && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
      {loading ? <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500">正在读取学生档案…</div> : filtered.length ? <div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="hidden grid-cols-[minmax(180px,1.4fr)_110px_120px_150px_160px_120px] items-center border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 lg:grid"><span>学生姓名</span><span>年级</span><span>归档题目数</span><span>学习状态</span><span>最近活跃</span><span className="text-right">操作</span></div>{filtered.map((student) => <Link href={`/students/${student.id}`} key={student.id} className="group flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 lg:grid lg:grid-cols-[minmax(180px,1.4fr)_110px_120px_150px_160px_120px] lg:gap-3"><div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-slate-900 text-sm font-bold text-white">{student.name.slice(0, 1)}</span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-950">{student.name}</h3><p className="truncate text-xs text-slate-500">{student.notes || "尚未添加备注"}</p></div></div><span className="hidden text-sm text-slate-600 sm:inline">{student.grade}</span><strong className="font-mono text-sm tabular-nums text-slate-900">{student.questionCount}<span className="ml-1 font-sans font-normal text-slate-400">道</span></strong><span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${Number(student.questionCount) ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>{Number(student.questionCount) ? <CheckCircle2 className="size-3.5" /> : <Sparkles className="size-3.5" />}{Number(student.questionCount) ? "学习中" : "待开始"}</span><span className="flex items-center gap-1.5 text-sm text-slate-500"><CalendarDays className="size-4 text-slate-400" />{formatActivity(student.latestQuestionAt)}</span><span className="ml-auto inline-flex items-center justify-end gap-1 text-sm font-semibold text-emerald-700 lg:ml-0">查看档案<ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span></Link>)}</div> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center"><UserRound className="mx-auto size-9 text-slate-300" /><h3 className="mt-4 font-semibold text-slate-900">还没有匹配的学生</h3><p className="mt-1 text-sm text-slate-500">新建档案后即可开始上传题目。</p></div>}
    </section>
  </div>;
}


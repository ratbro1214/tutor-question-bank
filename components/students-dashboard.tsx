"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, CalendarDays, CheckCircle2, LoaderCircle, Plus, RotateCcw, Search, Sparkles, Trash2, UserRound } from "lucide-react";
import { WorkspaceMetric } from "@/components/workspace-metric";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type Student = { id: number; name: string; grade: string; notes: string; questionCount: number; latestQuestionAt: string | null };
type TrashData = {
  students: { id: number; name: string; grade: string; deletedAt: string }[];
  questions: { id: number; studentName: string; chapterName: string; originalFilename: string; deletedAt: string }[];
};

function formatActivity(value: string | null) {
  if (!value) return "暂无记录";
  const date = new Date(value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function StudentsDashboard() {
  const [gradeFilter, setGradeFilter] = useState(""); const [statusFilter, setStatusFilter] = useState("");
  const [students, setStudents] = useState<Student[]>([]); const [query, setQuery] = useState(""); const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false); const [trash, setTrash] = useState<TrashData>({ students: [], questions: [] }); const [trashBusy, setTrashBusy] = useState("");
  async function loadStudents() {
    setLoading(true);
    try {
      const response = await fetch("/api/students", { cache: "no-store" });
      const data = await response.json() as { error?: string; students?: Student[] };
      if (!response.ok) throw new Error(data.error || "加载失败");
      setStudents(data.students || []); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "学生档案读取失败，请重试。"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void Promise.resolve().then(loadStudents); }, []);
  const filtered = useMemo(() => students.filter((s) => `${s.name}${s.grade}${s.notes}`.toLowerCase().includes(query.toLowerCase()) && (!gradeFilter || s.grade === gradeFilter) && (!statusFilter || (statusFilter === "recorded" ? Number(s.questionCount) > 0 : !Number(s.questionCount)))), [students, query, gradeFilter, statusFilter]);
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
    <section className="flex flex-col gap-5 border-b border-slate-200 pb-7 md:flex-row md:items-end md:justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-terracotta-700">学生档案</p><h1 className="font-bold tracking-tight text-gray-950 text-[32px]">学生学习工作台</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">集中查看学生题目、知识点与最近活动。记录学习线索，不替学生下掌握结论。</p></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Dialog open={trashOpen} onOpenChange={(value) => { setTrashOpen(value); if (value) void loadTrash(); }}><DialogTrigger asChild><Button size="lg" variant="outline"><Trash2 />回收站</Button></DialogTrigger><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>回收站</DialogTitle><DialogDescription>可恢复误删的学生和题目，永久删除后无法找回。</DialogDescription></DialogHeader><div className="my-5 max-h-[60vh] space-y-5 overflow-y-auto pr-1">{!trash.students.length && !trash.questions.length ? <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">回收站为空</p> : <>{trash.students.length > 0 && <section><h3 className="mb-2 text-sm font-semibold text-slate-800">学生</h3><div className="space-y-2">{trash.students.map(item => <div key={`student-${item.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0 flex-1"><b className="block truncate text-slate-900">{item.name}</b><span className="text-xs text-slate-500">{item.grade} · 包含其全部题目</span></div><Button size="sm" variant="outline" onClick={() => changeTrash("POST", "student", item.id)} disabled={!!trashBusy}>{trashBusy === `student-${item.id}-POST` ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}恢复</Button><Button size="sm" variant="outline" onClick={() => changeTrash("DELETE", "student", item.id)} disabled={!!trashBusy} className="text-red-700">永久删除</Button></div>)}</div></section>}{trash.questions.length > 0 && <section><h3 className="mb-2 text-sm font-semibold text-slate-800">单独删除的题目</h3><div className="space-y-2">{trash.questions.map(item => <div key={`question-${item.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0 flex-1"><b className="block truncate text-slate-900">{item.originalFilename}</b><span className="text-xs text-slate-500">{item.studentName} · {item.chapterName}</span></div><Button size="sm" variant="outline" onClick={() => changeTrash("POST", "question", item.id)} disabled={!!trashBusy}>{trashBusy === `question-${item.id}-POST` ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}恢复</Button><Button size="sm" variant="outline" onClick={() => changeTrash("DELETE", "question", item.id)} disabled={!!trashBusy} className="text-red-700">永久删除</Button></div>)}</div></section>}</>}</div></DialogContent></Dialog>
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="lg"><Plus />新建学生档案</Button></DialogTrigger><DialogContent><form onSubmit={createStudent}><DialogHeader><DialogTitle>新建学生档案</DialogTitle><DialogDescription>先记录基础信息，后续题目会自动归入该学生的题库。</DialogDescription></DialogHeader><div className="my-6 grid gap-4"><div className="grid gap-2"><Label htmlFor="name">学生姓名</Label><Input id="name" name="name" placeholder="例如：小林" required autoFocus /></div><div className="grid gap-2"><Label htmlFor="grade">年级</Label><Input id="grade" name="grade" placeholder="例如：初二" defaultValue="初中" /></div><div className="grid gap-2"><Label htmlFor="notes">备注</Label><Textarea id="notes" name="notes" placeholder="选填，例如授课时间或学习目标" /></div></div><DialogFooter><Button type="submit" disabled={saving}>{saving ? "保存中…" : "保存档案"}</Button></DialogFooter></form></DialogContent></Dialog>
      </div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="学习记录概览">
      <WorkspaceMetric label="学生档案" value={loading ? "—" : students.length} note="已建立的学生学习档案" icon={<UserRound className="size-5" />} />
      <WorkspaceMetric label="归档题目" value={loading ? "—" : questionTotal} note="累积保存的题目与分类" icon={<BookOpen className="size-5" />} />
      <WorkspaceMetric label="近 7 天录题学生" value={loading ? "—" : students.filter(s => s.latestQuestionAt && Date.now() - new Date(s.latestQuestionAt.endsWith("Z") ? s.latestQuestionAt : s.latestQuestionAt + "Z").getTime() < 7 * 86400000).length} note="按最近一次录题时间统计" icon={<CalendarDays className="size-5" />} />
      <WorkspaceMetric label="待首次录入" value={loading ? "—" : students.filter(s => !Number(s.questionCount)).length} note="为尚无题目记录的学生开始归档" icon={<Sparkles className="size-5" />} />
    </section>
    <section className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="surface-card action-grid p-6 sm:p-8"><div className="flex items-center gap-2 text-sm font-semibold text-terracotta-900"><Sparkles className="size-4" />下一步教学行动</div><h2 className="mt-4 text-xl font-semibold">{loading ? "正在整理学习记录…" : !students.length ? "从第一份学生档案开始" : students.some(s => !Number(s.questionCount)) ? "为学生建立第一条学习线索" : "题目已归档，继续记录学习过程"}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{students.some(s => !Number(s.questionCount)) ? students.filter(s => !Number(s.questionCount)).slice(0, 3).map(s => s.name).join("、") + " 尚无题目记录，可先录入一道近期遇到的题。" : "进入学生档案，记录作答与反馈，再依据学习证据安排诊断和复习。"}</p><div className="mt-5 flex flex-wrap gap-3">{students.length ? <Link href="/upload" className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white">录入题目<ArrowUpRight className="size-4" /></Link> : <Button onClick={() => setOpen(true)} disabled={loading}><Plus />建立学生档案</Button>}<Link href="/papers" className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">整理套卷复习</Link></div></div>
      <div className="surface-card p-6"><h2 className="text-base font-semibold">最近录题</h2><div className="mt-4 space-y-4">{loading ? <Skeleton className="h-16 w-full" /> : students.filter(s => s.latestQuestionAt).sort((a,b) => b.latestQuestionAt!.localeCompare(a.latestQuestionAt!)).slice(0,3).map(s => <Link className="flex items-center gap-3 rounded-lg hover:bg-slate-50" key={s.id} href={`/students/${s.id}`}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-terracotta-50 text-sm font-semibold text-terracotta-800">{s.name.slice(0,1)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{s.name}</p><p className="text-xs text-slate-400">{s.grade} · {s.questionCount} 道归档题</p></div><span className="text-xs text-slate-500">{formatActivity(s.latestQuestionAt)}</span></Link>)}{!loading && !students.some(s => s.latestQuestionAt) && <p className="text-sm leading-6 text-slate-500">录入题目后，这里会显示学生的最近活动。</p>}</div></div>
    </section>
    <section className="surface-card p-5 sm:p-6"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold text-slate-950">学生列表</h2><p className="mt-1 text-sm text-slate-500">查看归档题目与最近录题时间，进入学生档案</p></div><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="搜索学生姓名、年级或备注" placeholder="搜索姓名、年级或备注" className="bg-white pl-9" /></div></div>
      <div className="mb-4 flex flex-wrap gap-3"><select aria-label="按年级筛选学生" value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">全部年级</option>{[...new Set(students.map(s => s.grade))].map(grade => <option key={grade}>{grade}</option>)}</select><select aria-label="按录题状态筛选学生" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">全部录题状态</option><option value="recorded">已有题目</option><option value="empty">待首次录入</option></select><span className="ml-auto self-center text-xs text-slate-400">{loading ? "读取中…" : filtered.length + " 位学生"}</span></div>
      {error && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}<Button size="sm" variant="outline" className="ml-3" onClick={() => void loadStudents()} disabled={loading}>重新读取</Button></div>}
      {loading ? <div role="status" aria-label="正在读取学生档案" className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"><span className="sr-only">正在读取学生档案…</span>{Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="flex items-center gap-4"><Skeleton className="size-10 shrink-0" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-48 max-w-full" /></div><Skeleton className="hidden h-4 w-20 sm:block" /></div>)}</div> : filtered.length ? <div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="hidden grid-cols-[minmax(120px,1.4fr)_70px_90px_110px_110px_90px] items-center border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 xl:grid"><span>学生姓名</span><span>年级</span><span>归档题目数</span><span>题目录入</span><span>最近录题</span><span className="text-right">操作</span></div>{filtered.map((student) => <Link href={`/students/${student.id}`} key={student.id} className="group flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-terracotta-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-terracotta-600 xl:grid xl:grid-cols-[minmax(120px,1.4fr)_70px_90px_110px_110px_90px] xl:gap-3"><div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-slate-900 text-sm font-bold text-white">{student.name.slice(0, 1)}</span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-950">{student.name}</h3><p className="truncate text-xs text-slate-500">{student.notes || "尚未添加备注"}</p></div></div><span className="hidden text-sm text-slate-600 sm:inline">{student.grade}</span><strong className="font-mono text-sm tabular-nums text-slate-900">{student.questionCount}<span className="ml-1 font-sans font-normal text-slate-400">道</span></strong><span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${Number(student.questionCount) ? "bg-terracotta-50 text-terracotta-700" : "bg-orange-50 text-orange-700"}`}>{Number(student.questionCount) ? <CheckCircle2 className="size-3.5" /> : <Sparkles className="size-3.5" />}{Number(student.questionCount) ? "已有题目" : "未录题"}</span><span className="flex items-center gap-1.5 text-sm text-slate-500"><CalendarDays className="size-4 text-slate-400" />{formatActivity(student.latestQuestionAt)}</span><span className="ml-auto inline-flex items-center justify-end gap-1 text-sm font-semibold text-terracotta-700 xl:ml-0">查看档案<ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span></Link>)}</div> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center"><UserRound className="mx-auto size-9 text-slate-300" /><h3 className="mt-4 font-semibold text-slate-900">还没有匹配的学生</h3><p className="mt-1 text-sm text-slate-500">{query.trim() ? "试试其他姓名、年级或备注，或清空搜索。" : "新建档案后即可开始上传题目。"}</p></div>}
    </section>
  </div>;
}

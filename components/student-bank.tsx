"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarDays, ImageIcon, LoaderCircle, Pencil, Search, Tags, Trash2, TrendingUp, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LearningPanel } from "@/components/learning-panel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { Classification } from "@/lib/classification";

type Question = {
  id: number;
  extractedQuestion: string;
  chapterCode: string;
  chapterName: string;
  questionType: string;
  difficulty: string;
  createdAt: string;
  imageUrl: string;
  knowledgePoints: { code: string; name: string }[];
  aiClassification: Classification | null;
  classificationSource: "live_ai" | "demo" | "manual" | "legacy";
  teacherConfirmedClassification: Classification;
};
type Student = { id: number; name: string; grade: string; notes: string };

export function StudentBank({ id }: { id: string }) {
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [point, setPoint] = useState("all");
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);

  async function loadStudent(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/students/${id}`, { cache: "no-store" });
      const data = await response.json() as {error:string;student:Student;questions:Question[]};
      if (!response.ok) throw new Error(data.error);
      setStudent(data.student);
      setQuestions(data.questions);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载失败");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) return loadStudent(true); }); return () => { active = false; }; }, [id]);

  const pointCounts = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    questions.forEach((question) => question.knowledgePoints.forEach((item) => counts.set(item.code, {
      name: item.name,
      count: (counts.get(item.code)?.count || 0) + 1,
    })));
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [questions]);
  const chapterCount = new Set(questions.map((question) => question.chapterCode)).size;
  const filtered = questions.filter((question) =>
    (point === "all" || question.knowledgePoints.some((item) => item.code === point))
    && `${question.extractedQuestion}${question.chapterName}${question.knowledgePoints.map((item) => item.name).join("")}`.toLowerCase().includes(query.toLowerCase()));
  async function deleteStudent() {
    if (!student || !window.confirm(`确定将学生“${student.name}”移入回收站吗？其 ${questions.length} 道题会一起移入，之后可以恢复。`)) return;
    setDeletingStudent(true);
    setError("");
    try {
      const response = await fetch(`/api/students/${id}`, { method: "DELETE" });
      const data = await response.json() as {error:string;student:Student;questions:Question[]};
      if (!response.ok) throw new Error(data.error || "删除失败");
      router.push("/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
      setDeletingStudent(false);
    }
  }

  async function updateStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingStudent(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/students/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), grade: form.get("grade"), notes: form.get("notes") }),
      });
      const data = await response.json() as {error:string;student:Student;questions:Question[]};
      if (!response.ok) throw new Error(data.error || "保存失败");
      setStudent(data.student);
      setEditStudentOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSavingStudent(false);
    }
  }

  if (loading) return <div className="grid min-h-[50vh] place-items-center text-slate-500">正在整理学生题库…</div>;
  if (error || !student) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">{error || "没有找到该学生。"}</div>;

  return <div className="space-y-8">
    <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-indigo-700"><ArrowLeft className="size-4" />返回学生列表</Link>
        <div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 text-xl font-semibold text-white shadow-md">{student.name.slice(0, 1)}</span><div><h1 className="text-3xl font-semibold tracking-tight text-gray-900">{student.name}的题库</h1><p className="mt-1 text-gray-500">{student.grade}{student.notes ? ` · ${student.notes}` : ""}</p></div></div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" variant="outline" onClick={() => setEditStudentOpen(true)}><Pencil />编辑资料</Button>
        <Button size="lg" variant="outline" onClick={deleteStudent} disabled={deletingStudent} className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800">{deletingStudent ? <><LoaderCircle className="animate-spin" />正在移动…</> : <><Trash2 />移入回收站</>}</Button>
        <Button asChild size="lg"><Link href="/upload"><Upload />录入新题</Link></Button>
      </div>
    </section>

    <Dialog open={editStudentOpen} onOpenChange={setEditStudentOpen}>
      <DialogContent>
        {student && <form onSubmit={updateStudent}>
          <DialogHeader><DialogTitle>编辑学生资料</DialogTitle><DialogDescription>修改姓名、年级和备注，不影响已归档题目。</DialogDescription></DialogHeader>
          <div className="my-6 grid gap-4">
            <div className="grid gap-2"><Label htmlFor="edit-student-name">学生姓名</Label><Input id="edit-student-name" name="name" defaultValue={student.name} required /></div>
            <div className="grid gap-2"><Label htmlFor="edit-student-grade">年级</Label><Input id="edit-student-grade" name="grade" defaultValue={student.grade} required /></div>
            <div className="grid gap-2"><Label htmlFor="edit-student-notes">备注</Label><Textarea id="edit-student-notes" name="notes" defaultValue={student.notes} /></div>
          </div>
          <DialogFooter><Button type="submit" disabled={savingStudent}>{savingStudent ? <><LoaderCircle className="animate-spin" />保存中…</> : "保存资料"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>

    <section className="grid gap-4 sm:grid-cols-3">{[
      { label: "归档题目", value: questions.length, icon: BookOpen },
      { label: "涉及章节", value: chapterCount, icon: Tags },
      { label: "最常出现", value: pointCounts[0]?.[1].name || "暂无", icon: TrendingUp },
    ].map(({ label, value, icon: Icon }) => <div key={label} className="surface-card surface-card-interactive p-5"><div className="flex items-center justify-between"><p className="text-sm text-gray-500">{label}</p><Icon className="size-5 text-indigo-500" /></div><p className="mt-2 truncate text-2xl font-semibold tracking-tight text-gray-900">{value}</p></div>)}</section>

    {pointCounts.length > 0 && <section className="surface-card p-5"><h2 className="font-semibold text-gray-900">提问知识点分布</h2><p className="mt-1 text-sm text-gray-500">只反映题目出现次数，不等同于掌握程度。</p><div className="mt-5 grid gap-3 md:grid-cols-2">{pointCounts.slice(0, 6).map(([code, item]) => <div key={code} className="grid grid-cols-[minmax(90px,1fr)_2fr_30px] items-center gap-3 text-sm"><span className="truncate text-slate-700">{item.name}</span><span className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600" style={{ width: `${Math.max(12, item.count / (pointCounts[0]?.[1].count || 1) * 100)}%` }} /></span><b className="text-right text-slate-900">{item.count}</b></div>)}</div></section>}

    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-bold text-slate-950">全部题目</h2><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题目或知识点" className="bg-white pl-9 sm:w-64" /></div><NativeSelect value={point} onChange={(event) => setPoint(event.target.value)} className="w-full bg-white sm:w-48"><NativeSelectOption value="all">全部知识点</NativeSelectOption>{pointCounts.map(([code, item]) => <NativeSelectOption key={code} value={code}>{item.name} ({item.count})</NativeSelectOption>)}</NativeSelect></div></div>
      {filtered.length ? <div className="space-y-4">{filtered.map((question) => <Link href={`/students/${id}/questions/${question.id}`} key={question.id} className="group grid w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--color-brand-primary)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)] md:grid-cols-[240px_1fr]"><div className="grid min-h-44 place-items-center bg-slate-100"><img src={question.imageUrl} alt="题目图片" className="h-full max-h-60 w-full object-contain" /></div><div className="p-5"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-indigo-100 text-indigo-800">{question.chapterName}</Badge><Badge variant="outline">{question.difficulty}</Badge>{question.classificationSource === "manual" && <Badge variant="outline">人工分类</Badge>}{question.classificationSource === "demo" && <Badge variant="outline">演示分类</Badge>}<span className="ml-auto flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="size-3.5" />{new Date(question.createdAt + "Z").toLocaleDateString("zh-CN")}</span></div><p className="mt-4 text-sm text-slate-500">以原题图片为准，点击进入完整详情页。</p><div className="mt-4 flex flex-wrap gap-2">{question.knowledgePoints.map((item) => <span key={item.code} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.name}</span>)}</div><div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500"><span>题型：{question.questionType}</span><span className="inline-flex items-center gap-1 font-medium text-[var(--color-brand-primary)]"><Pencil className="size-3.5" />打开题目详情</span></div></div></Link>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-12 text-center"><ImageIcon className="mx-auto size-9 text-slate-300" /><h3 className="mt-4 font-semibold text-slate-900">暂无匹配题目</h3><p className="mt-1 text-sm text-slate-500">调整筛选条件，或为该学生录入第一道题。</p></div>}
    </section>

    <LearningPanel key={id} studentId={id} questions={questions} onOpen={questionId => router.push(`/students/${id}/questions/${questionId}`)} />
  </div>;
}

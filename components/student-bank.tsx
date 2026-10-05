"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarDays, ImageIcon, LoaderCircle, Pencil, Search, Tags, Trash2, TrendingUp, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LearningPanel } from "@/components/learning-panel";
import { KnowledgeDistribution } from "@/components/knowledge-distribution";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { Classification } from "@/lib/classification";
import { broadQuestionCategory, questionCategoryOrder, questionChapterLabel } from "@/lib/question-category";
import { cn } from "@/lib/utils";

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
  methods: { code: string; name: string }[];
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
  const [category, setCategory] = useState("全部");
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
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    questions.forEach(question => {
      const name = broadQuestionCategory(question);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return questionCategoryOrder.filter(name => counts.has(name)).map(name => ({ name, count: counts.get(name)! }));
  }, [questions]);
  const filtered = questions.filter((question) =>
    (category === "全部" || broadQuestionCategory(question) === category)
    && (point === "all" || question.knowledgePoints.some((item) => item.code === point))
    && `${question.extractedQuestion}${question.chapterName}${question.knowledgePoints.map((item) => item.name).join("")}`.toLowerCase().includes(query.toLowerCase()));

  function selectCategory(nextCategory: string) {
    setCategory(nextCategory);
    setPoint("all");
    scrollToQuestions();
  }
  function scrollToQuestions() {
    requestAnimationFrame(() => document.getElementById("student-questions")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }));
  }
  function selectPoint(code: string) {
    setPoint(current => current === code ? "all" : code);
    setCategory("全部");
    setQuery("");
    scrollToQuestions();
  }
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

  return <div className="space-y-6">
    <section className="flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-terracotta-700"><ArrowLeft className="size-4" />返回学生列表</Link>
        <h1 className="font-bold tracking-tight text-gray-950 text-[32px]">{student.name}的学习档案</h1>
        <p className="mt-1 text-sm text-gray-500">题目归档、知识点分布与学习记录</p>
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

    <div className="grid items-start gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="space-y-5 border-b border-slate-200 pb-6 xl:sticky xl:top-6 xl:border-b-0 xl:border-r xl:pb-0 xl:pr-6">
        <div className="flex items-center gap-3 xl:block">
          <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-slate-900 text-xl font-bold text-white xl:size-16">{student.name.slice(0, 1)}</span>
          <div className="min-w-0 xl:mt-4"><h2 className="truncate text-lg font-bold text-slate-950">{student.name}</h2><p className="text-sm font-medium text-terracotta-700">{student.grade}</p></div>
        </div>
        <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">教师备注</p><p className="mt-2 text-sm leading-6 text-slate-600">{student.notes || "暂未添加备注，可在编辑资料中补充学习目标。"}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">常见知识点</p><div className="mt-2 flex flex-wrap gap-1.5">{pointCounts.length ? pointCounts.slice(0, 4).map(([code, item]) => <span key={code} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.name}</span>) : <span className="text-sm text-slate-400">录入题目后自动生成</span>}</div></div>
        <div className="border-l-2 border-orange-500 bg-orange-50/70 px-3 py-2.5 text-xs leading-5 text-orange-900">知识点次数仅表示题目出现频率，不代表掌握程度。</div>
      </aside>

      <div className="min-w-0 space-y-7">
    <section className="grid border-y border-slate-200 bg-white sm:grid-cols-[1.6fr_1fr_1.2fr]">{[
      { label: "归档题目", value: questions.length, icon: BookOpen, detail: "道" },
      { label: "涉及章节", value: chapterCount, icon: Tags, detail: "章" },
      { label: "最常出现", value: pointCounts[0]?.[1].name || "暂无", icon: TrendingUp, detail: pointCounts[0] ? `${pointCounts[0][1].count} 次` : "等待录入" },
    ].map(({ label, value, icon: Icon, detail }, index) => <div key={label} className={`min-w-0 px-5 py-4 ${index ? "border-t border-slate-200 sm:border-l sm:border-t-0" : ""}`}><div className="flex items-center gap-2 text-xs font-medium text-gray-500"><Icon className="size-4 text-terracotta-700" />{label}</div><strong className={`mt-1 block truncate font-mono font-bold leading-tight tracking-tight text-gray-950 ${typeof value === "number" ? "text-[30px]" : "text-xl sm:text-2xl"}`}>{value}</strong><span className="mt-1 block text-xs text-slate-400">{detail}</span></div>)}</section>

    {pointCounts.length > 0 && <KnowledgeDistribution points={pointCounts} selected={point} onSelect={selectPoint} />}

    {questions.length > 0 && <section className="border-b border-slate-200 pb-5"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-gray-950">按模块查看题目</h2><p className="mt-1 text-sm text-gray-500">选择分类，快速缩小题目范围。</p></div><span className="mt-2 font-mono text-xs text-slate-400 sm:mt-0">共 {questions.length} 道</span></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => selectCategory("全部")} className={cn("rounded-md border px-3 py-1.5 text-sm font-medium transition-colors", category === "全部" ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-terracotta-300 hover:text-terracotta-700")}>全部题目 <span className="ml-1 opacity-70">{questions.length}</span></button>{categoryCounts.map(item => <button type="button" key={item.name} onClick={() => selectCategory(item.name)} className={cn("rounded-md border px-3 py-1.5 text-sm font-medium transition-colors", category === item.name ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-terracotta-300 hover:text-terracotta-700")}>{item.name} <span className="ml-1 opacity-70">{item.count}</span></button>)}</div></section>}

    <section id="student-questions" className="scroll-mt-6">
      {(category !== "全部" || point !== "all" || query.trim()) && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-terracotta-100 bg-terracotta-50/50 px-3 py-2 text-xs text-terracotta-900"><span>当前筛选：</span>{category !== "全部" && <span>{category}</span>}{point !== "all" && <span>{pointCounts.find(([code]) => code === point)?.[1].name}</span>}{query.trim() && <span>搜索“{query.trim()}”</span>}<Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => { setCategory("全部"); setPoint("all"); setQuery(""); }}>清除筛选</Button></div>}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold text-slate-950">{category === "全部" ? "全部题目" : category}</h2><p className="mt-1 text-sm text-slate-500">共 {filtered.length} 道</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题目或知识点" className="bg-white pl-9 sm:w-64" /></div><NativeSelect value={point} onChange={(event) => setPoint(event.target.value)} className="w-full bg-white sm:w-48"><NativeSelectOption value="all">全部知识点</NativeSelectOption>{pointCounts.map(([code, item]) => <NativeSelectOption key={code} value={code}>{item.name} ({item.count})</NativeSelectOption>)}</NativeSelect></div></div>
      {filtered.length ? <div className="space-y-3">{filtered.map((question) => <Link href={`/students/${id}/questions/${question.id}`} key={question.id} className="group grid w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)] md:grid-cols-[180px_1fr]"><div className="grid min-h-36 place-items-center border-b border-slate-100 bg-slate-50 md:border-b-0 md:border-r"><img src={question.imageUrl} alt="题目图片" className="h-full max-h-48 w-full object-contain" /></div><div className="p-4"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-terracotta-50 text-terracotta-800">{broadQuestionCategory(question)}</Badge><Badge variant="outline">{questionChapterLabel(question)}</Badge><Badge variant="outline">{question.difficulty}</Badge>{question.classificationSource === "manual" && <Badge variant="outline">人工分类</Badge>}{question.classificationSource === "demo" && <Badge variant="outline">演示分类</Badge>}<span className="ml-auto flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="size-3.5" />{new Date(question.createdAt + "Z").toLocaleDateString("zh-CN")}</span></div><p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{question.extractedQuestion || "以原题图片为准，点击进入完整详情页。"}</p><div className="mt-3 flex flex-wrap gap-2">{question.knowledgePoints.map((item) => <span key={item.code} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.name}</span>)}</div><div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500"><span>题型：{question.questionType}</span><span className="inline-flex items-center gap-1 font-semibold text-[var(--color-brand-primary)]"><Pencil className="size-3.5" />打开题目详情</span></div></div></Link>)}</div> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center"><ImageIcon className="mx-auto size-9 text-slate-300" /><h3 className="mt-4 font-semibold text-slate-900">暂无匹配题目</h3><p className="mt-1 text-sm text-slate-500">调整分类、搜索条件或知识点筛选。</p></div>}
    </section>

    <LearningPanel key={id} studentId={id} questions={questions} onOpen={questionId => router.push(`/students/${id}/questions/${questionId}`)} />
      </div>
    </div>
  </div>;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, LoaderCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/image-lightbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { LearningPanel } from "@/components/learning-panel";
import { QuestionExplanation } from "@/components/question-explanation";
import { StudentCanonicalButton } from "@/components/student-canonical-button";
import { normalizeClassificationTags, questionTypes, subjectForStage, taxonomyVersionForStage, type Classification, type EducationStage } from "@/lib/classification";
import { chapterName, chaptersForStage, taxonomyForStage } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

type Question = {
  id: number; chapterCode: string; chapterName: string; questionType: string; difficulty: string;
  createdAt: string; imageUrl: string; knowledgePoints: { code: string; name: string }[];
  classificationSource: "live_ai" | "demo" | "manual" | "legacy";
  teacherConfirmedClassification: Classification;
  paperSource?: { paperId: string; title: string; number: number } | null;
};
type Student = { id: number; name: string; grade: string; notes: string };

export function QuestionDetail({ studentId, questionId, diagnosticPlanId, entry = 'archive' }: { studentId: string; questionId: string; diagnosticPlanId?: string; entry?: 'archive' | 'library' }) {
  const router = useRouter();
  const backHref = entry === 'library' ? '/questions' : `/students/${studentId}?tab=questions`;
  const [student, setStudent] = useState<Student | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [draft, setDraft] = useState<Classification | null>(null);
  const [pointChapter, setPointChapter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/students/${studentId}`, { cache: "no-store" });
      const data = await response.json() as { error?: string; student: Student; questions: Question[] };
      if (!response.ok) throw new Error(data.error || "加载失败");
      const selected = data.questions.find(item => String(item.id) === questionId);
      if (!selected) throw new Error("没有找到该题目，或题目已被移入回收站。");
      setStudent(data.student); setQuestions(data.questions); setQuestion(selected);
      setDraft(normalizeClassificationTags(structuredClone(selected.teacherConfirmedClassification)));
      setPointChapter(selected.teacherConfirmedClassification.chapter.code);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "加载失败"); }
    finally { setLoading(false); }
  }, [questionId, studentId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return load(); });
    return () => { active = false; };
  }, [load]);

  const stageChapters = chaptersForStage(draft?.education_stage || "初中");
  const stageTaxonomy = taxonomyForStage(draft?.education_stage || "初中");
  const activePointChapter = pointChapter || draft?.chapter.code || "";
  const availablePoints = useMemo(() => stageTaxonomy.filter(([code, , chapter]) => chapter !== "METHOD" && (chapter === activePointChapter || draft?.knowledge_points.some(item => item.code === code))), [activePointChapter, draft?.knowledge_points, stageTaxonomy]);
  const availableMethods = useMemo(() => stageTaxonomy.filter(([, , chapter]) => chapter === "METHOD"), [stageTaxonomy]);

  function patchDraft(values: Partial<Classification>) { setDraft(current => current ? { ...current, ...values } : current); setMessage(""); }
  function changeStage(stage: EducationStage) {
    const first = chaptersForStage(stage)[0]; setPointChapter(first[0]);
    patchDraft({ education_stage: stage, subject: subjectForStage(stage), taxonomy_version: taxonomyVersionForStage(stage), chapter: { code: first[0], name: first[1] }, knowledge_points: [], methods: [], needs_review: true, review_reasons: ["OTHER"], classification_notes: "已切换知识点目录，请教师重新确认章节、知识点与数学思想方法。" });
  }
  function changeChapter(code: string) { setPointChapter(code); patchDraft({ chapter: { code, name: chapterName(code) } }); }
  function togglePoint(code: string) {
    if (!draft) return;
    const item = stageTaxonomy.find(([pointCode]) => pointCode === code); if (!item) return;
    const checked = draft.knowledge_points.some(point => point.code === code);
    const next = checked ? draft.knowledge_points.filter(point => point.code !== code) : [...draft.knowledge_points, { code: item[0], name: item[1] }];
    if (next.length > 4) { setError("一道题最多选择 4 个核心知识点。"); return; }
    setError(""); patchDraft({ knowledge_points: next });
  }
  function toggleMethod(code: string) {
    if (!draft) return;
    const item = stageTaxonomy.find(([pointCode, , owner]) => pointCode === code && owner === "METHOD"); if (!item) return;
    const checked = draft.methods.some(method => method.code === code);
    const next = checked ? draft.methods.filter(method => method.code !== code) : [...draft.methods, { code: item[0], name: item[1] }];
    if (next.length > 2) { setError("一道题最多选择 2 个数学思想或解题方法。"); return; }
    setError(""); patchDraft({ methods: next });
  }

  async function save() {
    if (!draft || !question) return;
    if (!draft.knowledge_points.length) { setError("请至少选择一个知识点。"); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/questions/${question.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherConfirmedClassification: draft, expectedClassification: JSON.stringify(question.teacherConfirmedClassification) }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "保存失败");
      await load(); setMessage("教师修改已保存，题库统计也已同步更新。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!question || !window.confirm("确定将这道题移入回收站吗？之后可在主页恢复。")) return;
    setDeleting(true); setError("");
    try {
      const response = await fetch(`/api/questions/${question.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "删除失败");
      router.push(backHref); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "删除失败"); setDeleting(false); }
  }

  if (loading) return <div className="grid min-h-[55vh] place-items-center text-[var(--color-text-secondary)]"><LoaderCircle className="mr-2 inline size-5 animate-spin" />正在打开题目…</div>;
  if (error && !question) return <div className="mx-auto max-w-3xl"><Link href={backHref} className="mb-5 inline-flex items-center gap-1 text-sm text-[var(--color-brand-primary)]"><ArrowLeft className="size-4" />返回{entry === 'library' ? '学生题库' : '学生归档题目'}</Link><div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">{error}</div></div>;
  if (!question || !draft || !student) return null;

  return <div className="mx-auto max-w-6xl space-y-8">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-brand-primary)]"><ArrowLeft className="size-4" />返回{entry === 'library' ? '学生题库' : `${student.name} 的归档题目`}</Link><h1 className="font-bold leading-[1.2] text-[var(--color-text-primary)] text-[32px]">{entry === 'library' ? '学生题库 · 题目详情' : '学习档案 · 题目详情'}</h1><p className="mt-2 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"><CalendarDays className="size-4" />题目 #{question.id} · {new Date(question.createdAt + "Z").toLocaleDateString("zh-CN")}</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={remove} disabled={deleting || saving} className="border-red-200 text-red-700 hover:bg-red-50">{deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}移入回收站</Button><Button onClick={save} disabled={saving || deleting || !draft.knowledge_points.length}>{saving ? <LoaderCircle className="animate-spin" /> : <Check />}{saving ? "保存中…" : "保存教师修改"}</Button></div>
    </header>

    {entry === 'library' && <p className="text-sm text-slate-500">所属学生：{student.name} · <Link className="text-terracotta-800 underline" href={`/students/${studentId}`}>查看个人学习档案 →</Link></p>}
    <StudentCanonicalButton key={question.id} questionId={question.id} studentId={studentId} disabled={saving || deleting} />
    {question.paperSource && <p className="text-sm text-slate-600">来自套卷：<Link href={`/papers/${question.paperSource.paperId}`} className="text-terracotta-800 underline">{question.paperSource.title} · 第 {question.paperSource.number} 题</Link></p>}
    {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
    {message && <div className="rounded-xl border border-terracotta-200 bg-terracotta-50 p-4 text-sm text-terracotta-900">{message}</div>}

    <div className="grid items-start gap-7 lg:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-6"><section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">题目原图</h2><Badge variant="outline">{student.grade}</Badge></div><ImageLightbox src={question.imageUrl} alt="题目原图"><button type="button" className="surface-card group block w-full overflow-hidden"><img src={question.imageUrl} alt="题目原图，点击放大" className="max-h-[68vh] w-full bg-slate-50 object-contain transition duration-200 group-hover:scale-[1.01]" /><span className="block border-t border-[var(--color-border-subtle)] bg-white px-4 py-3 text-center text-sm font-medium text-[var(--color-brand-primary)]">点击放大查看原图</span></button></ImageLightbox></section><QuestionExplanation key={question.id} studentId={studentId} questionId={question.id} questionText={question.teacherConfirmedClassification.extracted_question} /></div>
      <div className="space-y-6">
        <section className="surface-card space-y-5 p-5 sm:p-6"><div><h2 className="text-xl font-semibold">题目分类</h2><p className="mt-1 text-sm text-[var(--color-text-secondary)]">调整学段、章节、难度与题型</p></div><div className="grid gap-4 sm:grid-cols-3"><div className="grid gap-2"><Label>学段</Label><NativeSelect value={draft.education_stage} onChange={event => changeStage(event.target.value as EducationStage)} className="w-full"><NativeSelectOption value="初中">初中数学</NativeSelectOption><NativeSelectOption value="高中">高中数学</NativeSelectOption></NativeSelect></div><div className="grid gap-2"><Label>主章节</Label><NativeSelect value={draft.chapter.code} onChange={event => changeChapter(event.target.value)} className="w-full">{stageChapters.map(([code, name]) => <NativeSelectOption key={code} value={code}>{name}</NativeSelectOption>)}</NativeSelect></div><div className="grid gap-2"><Label>难度</Label><NativeSelect value={draft.difficulty} onChange={event => patchDraft({ difficulty: event.target.value as Classification["difficulty"] })} className="w-full">{["基础", "中等", "较难"].map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></div></div><div className="grid gap-2"><Label>题型</Label><NativeSelect value={draft.question_type} onChange={event => patchDraft({ question_type: event.target.value })} className="w-full">{questionTypes.map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></div></section>
        <section className="surface-card space-y-4 p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">知识点</h2><p className="mt-1 text-sm text-[var(--color-text-secondary)]">用于题库统计、筛选与学习记录</p></div><span className="text-sm text-[var(--color-text-secondary)]">已选 {draft.knowledge_points.length}/4</span></div><NativeSelect value={activePointChapter} onChange={event => setPointChapter(event.target.value)} className="w-full">{stageChapters.map(([code, name]) => <NativeSelectOption key={code} value={code}>{name}</NativeSelectOption>)}</NativeSelect><div className="flex max-h-72 flex-wrap content-start gap-2 overflow-y-auto rounded-2xl bg-slate-50 p-3">{availablePoints.map(([code, name]) => { const checked = draft.knowledge_points.some(item => item.code === code); return <button type="button" aria-pressed={checked} key={code} onClick={() => togglePoint(code)} className={cn("rounded-full border px-3 py-2 text-sm transition-all", checked ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary-soft)] font-medium text-[var(--color-brand-primary)]" : "border-slate-200 bg-white text-slate-600 hover:border-[var(--color-brand-primary)]")}>{name}</button>; })}</div></section>
        <section className="surface-card space-y-4 p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">数学思想与方法</h2><p className="mt-1 text-sm text-[var(--color-text-secondary)]">下钻查看的辅助维度，不计入知识点统计</p></div><span className="text-sm text-[var(--color-text-secondary)]">已选 {draft.methods.length}/2</span></div><div className="flex max-h-64 flex-wrap content-start gap-2 overflow-y-auto rounded-2xl bg-violet-50/50 p-3">{availableMethods.map(([code, name]) => { const checked = draft.methods.some(item => item.code === code); return <button type="button" aria-pressed={checked} key={code} onClick={() => toggleMethod(code)} className={cn("rounded-full border px-3 py-2 text-sm transition-all", checked ? "border-violet-200 bg-white font-medium text-violet-700 shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700")}>{name}</button>; })}</div></section>
        <section className="surface-card space-y-3 p-5 sm:p-6"><div><h2 className="text-xl font-semibold">分类依据</h2><p className="mt-1 text-sm text-[var(--color-text-secondary)]">补充教师判断或需要保留的说明</p></div><Input value={draft.classification_notes} onChange={event => patchDraft({ classification_notes: event.target.value })} /></section>
      </div>
    </div>

    {entry === 'archive' && <section><LearningPanel studentId={studentId} questions={questions} questionId={question.id} diagnosticPlanId={diagnosticPlanId} onOpen={id => router.push(`/students/${studentId}/questions/${id}`)} /></section>}
  </div>;
}

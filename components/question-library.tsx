"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, ChevronRight, FilePlus2, ImageIcon, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { broadQuestionCategory, questionCategoryOrder, questionChapterLabel } from "@/lib/question-category";
import { cn } from "@/lib/utils";

type Question = {
  id: number; studentId: number; studentName: string; studentGrade: string; imageUrl: string;
  extractedQuestion: string; chapterCode: string; chapterName: string; questionType: string;
  difficulty: string; createdAt: string; knowledgePoints: { code: string; name: string }[];
};

export function QuestionLibrary() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [category, setCategory] = useState("全部");
  const [chapter, setChapter] = useState("全部");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/questions", { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as { questions?: Question[]; error?: string };
        if (!response.ok) throw new Error(data.error || "题目库加载失败");
        setQuestions(data.questions || []);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "题目库加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>(questionCategoryOrder.map(name => [name, 0]));
    for (const question of questions) {
      const name = broadQuestionCategory(question);
      if (counts.has(name)) counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  }, [questions]);

  const chapters = useMemo(() => {
    if (category === "全部") return [];
    return [...new Set(questions
      .filter(question => broadQuestionCategory(question) === category)
      .map(questionChapterLabel))];
  }, [category, questions]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return questions.filter(question => {
      const matchesCategory = category === "全部" || broadQuestionCategory(question) === category;
      const matchesChapter = chapter === "全部" || questionChapterLabel(question) === chapter;
      const haystack = [question.chapterName, questionChapterLabel(question), question.questionType, question.studentName,
        question.studentGrade, question.extractedQuestion, ...question.knowledgePoints.map(point => point.name)].join(" ").toLowerCase();
      return matchesCategory && matchesChapter && (!needle || haystack.includes(needle));
    });
  }, [category, chapter, query, questions]);

  function selectCategory(nextCategory: string) {
    setCategory(nextCategory);
    setChapter("全部");
  }

  return <div className="space-y-8">
    <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="mb-2 text-sm font-semibold text-[var(--color-brand-primary)]">题目库</p><h1 className="font-semibold tracking-tight text-slate-950 text-[32px]">高中数学题库</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-500">按知识模块查看题目，进一步分析章节、知识点与学生掌握情况。</p></div>
      <Button asChild size="lg"><Link href="/upload"><FilePlus2 />录入新题目</Link></Button>
    </section>

    {!loading && !error && <section className="space-y-4">
      <button type="button" onClick={() => selectCategory("全部")} className={cn("flex w-full items-center gap-3 rounded-2xl border px-5 py-4 text-left transition sm:w-auto", category === "全部" ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary-soft)]" : "border-slate-200 bg-white hover:border-slate-300")}><span className="grid size-10 place-items-center rounded-xl bg-white text-[var(--color-brand-primary)] shadow-sm"><BookOpen className="size-5" /></span><span><b className="block text-sm text-slate-950">全部题目</b><span className="text-xs text-slate-500">查看全部 {questions.length} 道已录入题目</span></span><strong className="ml-auto text-2xl text-slate-950">{questions.length}</strong></button>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {questionCategoryOrder.map(name => {
          const count = categoryCounts.get(name) || 0;
          return <button type="button" key={name} onClick={() => selectCategory(name)} className={cn("min-h-32 rounded-2xl border p-4 text-left transition", category === name ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary-soft)]" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm")}><span className="block text-sm font-semibold leading-5 text-slate-900">{name}</span><b className="mt-4 block text-3xl text-slate-950">{count}</b><span className="mt-1 block text-xs text-slate-500">道题目 · {count ? "已录入" : "暂无"}</span></button>;
        })}
      </div>
    </section>}

    <section>
      <div className="mb-4 flex flex-col gap-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold text-slate-950">{category === "全部" ? "全部题目" : category}</h2>{!loading && <p className="mt-1 text-sm text-slate-500">共 {filtered.length} 道</p>}</div><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索章节、知识点或学生" className="bg-white pl-9" /></div></div>
        {category !== "全部" && chapters.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-medium text-slate-500">章节筛选</span><button type="button" onClick={() => setChapter("全部")} className={cn("rounded-full border px-3 py-1.5 text-sm transition", chapter === "全部" ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>全部章节</button>{chapters.map(name => <button type="button" key={name} onClick={() => setChapter(name)} className={cn("rounded-full border px-3 py-1.5 text-sm transition", chapter === name ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>{name}</button>)}</div>}
      </div>
      {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">{error}</div>}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">正在读取题目库…</div> : filtered.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map(question => <Link href={`/students/${question.studentId}/questions/${question.id}`} key={question.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--color-brand-primary)] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]"><div className="grid h-52 place-items-center overflow-hidden bg-slate-100"><img src={question.imageUrl} alt="题目原图" className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.02]" /></div><div className="p-5"><div className="flex flex-wrap gap-2"><Badge>{broadQuestionCategory(question)}</Badge><Badge variant="outline">{questionChapterLabel(question)}</Badge><Badge variant="outline">{question.difficulty}</Badge></div><p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">{question.extractedQuestion === "[以原题图片为准]" ? "以题目原图为准" : question.extractedQuestion}</p><div className="mt-3 flex min-h-6 flex-wrap gap-1.5">{question.knowledgePoints.slice(0, 3).map(point => <span key={point.code} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{point.name}</span>)}</div><div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><span className="font-medium text-slate-700">{question.studentName}</span><span>·</span><span>{question.studentGrade}</span><span className="ml-auto flex items-center gap-1"><CalendarDays className="size-3.5" />{new Date(`${question.createdAt}Z`).toLocaleDateString("zh-CN")}</span><ChevronRight className="size-4 transition group-hover:translate-x-0.5" /></div></div></Link>)}</div> : !error && <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-12 text-center"><ImageIcon className="mx-auto size-10 text-slate-300" /><h3 className="mt-4 font-semibold text-slate-900">{questions.length ? "这个分类还没有题目" : "还没有录入题目"}</h3><p className="mt-1 text-sm text-slate-500">{questions.length ? "可以选择其他分类，或录入一道新题目。" : "录入第一道题后，会自动出现在对应模块中。"}</p><Button asChild className="mt-5"><Link href="/upload"><FilePlus2 />录入题目</Link></Button></div>}
    </section>
  </div>;
}
